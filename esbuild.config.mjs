import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: {
    main: 'src/main.ts',
    embed: 'src/embed.ts',
    area: 'src/area.ts',
    browse: 'src/browse.ts',
    compare: 'src/compare.ts',
  },
  bundle: true,
  outdir: 'public/dist',
  format: 'iife',
  sourcemap: true,
  target: 'es2020',
  minify: !watch,
  external: [],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(options);
  console.log('Build complete.');
}
