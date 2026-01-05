import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: 'src/main.ts',
	clean: true,
	treeshake: true,
});
