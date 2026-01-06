import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: 'src/index.ts',
	clean: true,
	treeshake: true,
	shims: true,
	platform: 'node',
	target: 'node20',
	outDir: 'dist',
	unbundle: true,
});
