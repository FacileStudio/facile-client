import { plugin } from 'bun';
import { compileModule } from 'svelte/compiler';

const transpiler = new Bun.Transpiler({ loader: 'ts' });

plugin({
	name: 'svelte-module',
	setup(build) {
		build.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
			const source = transpiler.transformSync(await Bun.file(path).text());
			const { js } = compileModule(source, { filename: path, generate: 'client' });
			return { contents: js.code, loader: 'js' };
		});
	}
});
