import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';

export function startWatcher(
    inputDir: string,
    onNewFile: (filePath: string, content: string) => void
) {
    console.log(`Watching for new text files in ${inputDir}...`);

    const watcher = chokidar.watch(inputDir, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher.on('add', (filePath) => {
        if (path.extname(filePath) === '.txt') {
            console.log(`New file detected: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf-8');
            onNewFile(filePath, content);
        }
    });

    return watcher;
}
