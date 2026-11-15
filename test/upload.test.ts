import { afterEach, describe, expect, test } from 'bun:test';
import { ApiError, uploadWithProgress } from '../src/lib/core';

async function failure(call: Promise<unknown>): Promise<ApiError> {
	try {
		await call;
	} catch (error) {
		return error as ApiError;
	}
	throw new Error('the call resolved');
}

const realXhr = globalThis.XMLHttpRequest;

type Script = { status: number; text: string } | 'error' | 'hang';

class FakeXhr {
	static last: FakeXhr;
	static script: Script = { status: 200, text: '{}' };
	headers: Record<string, string> = {};
	status = 0;
	responseText = '';
	upload: { onprogress?: (event: unknown) => void } = {};
	onload?: () => void;
	onerror?: () => void;
	onabort?: () => void;
	method = '';
	constructor() {
		FakeXhr.last = this;
	}
	open(method: string): void {
		this.method = method;
	}
	setRequestHeader(key: string, value: string): void {
		this.headers[key.toLowerCase()] = value;
	}
	getResponseHeader(): string | null {
		return null;
	}
	abort(): void {
		this.onabort?.();
	}
	send(): void {
		this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
		if (FakeXhr.script === 'hang') return;
		if (FakeXhr.script === 'error') return this.onerror?.();
		this.status = FakeXhr.script.status;
		this.responseText = FakeXhr.script.text;
		this.onload?.();
	}
}

function install(script: Script): void {
	FakeXhr.script = script;
	globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
}

afterEach(() => {
	globalThis.XMLHttpRequest = realXhr;
});

describe('uploadWithProgress', () => {
	test('resolves the JSON, reports progress and sends the CSRF header', async () => {
		install({ status: 201, text: '{"id":3}' });
		const progress: number[][] = [];
		const result = await uploadWithProgress('/api/files', 'x', {
			headers: { Authorization: 'Bearer t' },
			onProgress: (loaded, total) => progress.push([loaded, total])
		});
		expect(result).toEqual({ id: 3 });
		expect(progress).toEqual([[5, 10]]);
		expect(FakeXhr.last.headers['x-facile-csrf']).toBe('1');
		expect(FakeXhr.last.headers.authorization).toBe('Bearer t');
	});

	test('csrf false leaves the header off', async () => {
		install({ status: 200, text: '{}' });
		await uploadWithProgress('/api/files', 'x', { csrf: false });
		expect(FakeXhr.last.headers['x-facile-csrf']).toBeUndefined();
	});

	test('an envelope error becomes an ApiError and a network failure status 0', async () => {
		install({ status: 402, text: '{"error":{"code":"plan_limit","message":"full"}}' });
		const refused = await failure(uploadWithProgress('/u', 'x'));
		expect([refused.status, refused.code, refused.message]).toEqual([402, 'plan_limit', 'full']);
		install('error');
		const lost = await failure(uploadWithProgress('/u', 'x'));
		expect([lost.status, lost.code]).toEqual([0, 'network']);
	});

	test('an abort signal rejects with AbortError', async () => {
		install('hang');
		const controller = new AbortController();
		const pending = uploadWithProgress('/u', 'x', { signal: controller.signal });
		controller.abort();
		expect((await failure(pending)).name).toBe('AbortError');
	});
});
