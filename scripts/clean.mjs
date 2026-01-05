import * as Fs from 'node:fs';
import * as Glob from 'glob';

const dirs = ['.', ...Glob.sync('packages/*/', ...Glob.sync('packages/ai/*/'))];
dirs.forEach((pkg) => {
	const files = ['.tsbuildinfo', 'docs', 'build', 'dist', 'coverage'];

	files.forEach((file) => {
		if (pkg === '.' && file === 'docs') {
			return;
		}

		Fs.rmSync(`${pkg}/${file}`, { recursive: true, force: true }, () => {});
	});
});

Glob.sync('docs/*/').forEach((dir) => {
	Fs.rmSync(dir, { recursive: true, force: true }, () => {});
});
