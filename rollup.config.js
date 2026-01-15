import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import external from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import resolve from '@rollup/plugin-node-resolve';

import pkg from './package.json';

export default {
    input: 'src/index.js',
    output: [
        {
            file: pkg.main,
            format: 'cjs',
            sourcemap: true,
            exports: 'auto'
        },
        {
            file: pkg.module,
            format: 'es',
            sourcemap: true,
            exports: 'auto'
        }
    ],
    plugins: [
        external(),
        postcss({
            modules: false
        }),
        babel({
            exclude: 'node_modules/**',
            babelHelpers: 'runtime'
        }),
        resolve(),
        commonjs()
    ],
    external: ['fs', 'path', 'os', 'electron', 'child_process', 'util', 'events']
};
