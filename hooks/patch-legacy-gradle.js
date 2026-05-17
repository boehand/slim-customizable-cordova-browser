#!/usr/bin/env node
/*
 * Cordova `before_build` hook.
 * Rewrites legacy Gradle DSL in third-party plugin .gradle files so they
 * compile against Gradle 7+ / AGP 8+:
 *
 *   compile  '...'           -> implementation '...'
 *   testCompile '...'        -> testImplementation '...'
 *   androidTestCompile '...' -> androidTestImplementation '...'
 *   provided '...'           -> compileOnly '...'
 *   apk '...'                -> runtimeOnly '...'
 *
 * Touches files only under platforms/android/<plugin-id>/*.gradle so we don't
 * accidentally rewrite Cordova's own gradle files.
 */
const fs = require('fs');
const path = require('path');

module.exports = function (ctx) {
    const rootDir = ctx && ctx.opts && ctx.opts.projectRoot
        ? ctx.opts.projectRoot
        : path.resolve(__dirname, '..');
    const pluginsDir = path.join(rootDir, 'platforms', 'android');
    if (!fs.existsSync(pluginsDir)) return;

    const subs = [
        [/^(\s*)compile(\s+["'])/gm, '$1implementation$2'],
        [/^(\s*)testCompile(\s+["'])/gm, '$1testImplementation$2'],
        [/^(\s*)androidTestCompile(\s+["'])/gm, '$1androidTestImplementation$2'],
        [/^(\s*)provided(\s+["'])/gm, '$1compileOnly$2'],
        [/^(\s*)apk(\s+["'])/gm, '$1runtimeOnly$2']
    ];

    const visit = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                // Skip Cordova framework + build output to limit blast radius.
                if (entry.name === 'app' || entry.name === 'CordovaLib' || entry.name === 'build' || entry.name === '.gradle') continue;
                visit(full);
            } else if (entry.name.endsWith('.gradle')) {
                let src = fs.readFileSync(full, 'utf8');
                let changed = false;
                for (const [re, rep] of subs) {
                    const next = src.replace(re, rep);
                    if (next !== src) changed = true;
                    src = next;
                }
                if (changed) {
                    fs.writeFileSync(full, src);
                    console.log('[patch-legacy-gradle] updated', path.relative(rootDir, full));
                }
            }
        }
    };

    visit(pluginsDir);
};

if (require.main === module) {
    module.exports({ opts: { projectRoot: path.resolve(__dirname, '..') } });
}
