#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 12000;

function findBrowser() {
    const candidates = [];
    if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
    if (process.platform === 'win32') {
        const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
        const pfx86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const local = process.env.LOCALAPPDATA || '';
        candidates.push(
            path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        );
    } else if (process.platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        );
    }
    candidates.push('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'msedge');
    for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
        const result = spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 3000 });
        if (!result.error && result.status === 0) return candidate;
    }
    return null;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForJson(url, timeout = TIMEOUT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const data = await new Promise((resolve, reject) => {
                http.get(url, res => {
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => { body += chunk; });
                    res.on('end', () => {
                        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
                    });
                }).on('error', reject).setTimeout(500, function () { this.destroy(); });
            });
            return data;
        } catch (_) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    throw new Error(`Chrome DevTools endpoint timeout (${timeout}ms)`);
}

class CDPClient {
    constructor(wsUrl) {
        if (typeof WebSocket !== 'function') {
            throw new Error('Visual tests require Node.js with built-in WebSocket support (Node 22+ recommended).');
        }
        this.ws = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
    }
    async open() {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000);
            this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.ws.addEventListener('error', event => { clearTimeout(timer); reject(event.error || new Error('WebSocket error')); }, { once: true });
        });
        this.ws.addEventListener('message', event => {
            const msg = JSON.parse(event.data);
            if (!msg.id || !this.pending.has(msg.id)) return;
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
            else resolve(msg.result || {});
        });
    }
    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { try { this.ws.close(); } catch (_) {} }
}

function fixtureHtml() {
    const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'visual', 'busho_gauge.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    return fixture.replace('<!-- APP_CSS -->', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}

function approx(actual, expected, tolerance, message) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
}

function validate(rows) {
    assert.strictEqual(rows.length, 4);
    const byValue = new Map(rows.map(row => [row.value, row]));
    for (const value of [80, 100, 110, 120]) {
        const row = byValue.get(value);
        assert.ok(row, `${value}の行がありません`);
        assert.ok(row.wrapper.width > 140, `${value}: ゲージ領域が短すぎます (${row.wrapper.width}px)`);
        assert.ok(row.wrapper.height >= 10, `${value}: ゲージ領域の高さが潰れています (${row.wrapper.height}px)`);
        assert.ok(row.base.height >= 10, `${value}: 基準ゲージの高さが潰れています (${row.base.height}px)`);
        assert.ok(row.fill.height >= 8, `${value}: 塗りゲージの高さが潰れています (${row.fill.height}px)`);
        approx(row.base.width / row.wrapper.width, 100 / 120, 0.015, `${value}: 100の基準枠比率`);
        approx(row.fill.width / row.wrapper.width, value / 120, 0.018, `${value}: 能力値に対する描画幅`);
        assert.ok(row.fill.right <= row.rightColumnLeft - 5, `${value}: 右側情報欄へ侵入しています`);
        assert.ok(row.fill.right <= row.row.right + 0.5, `${value}: 能力値行の外へ侵入しています`);
    }
    const v80 = byValue.get(80), v100 = byValue.get(100), v110 = byValue.get(110), v120 = byValue.get(120);
    assert.ok(v80.fill.right < v80.base.right - 2, '80は100枠内に収まる必要があります');
    approx(v100.fill.right, v100.base.right, 1.5, '100は通常枠右端に一致する必要があります');
    assert.ok(v110.fill.right > v110.base.right + 2, '110は100枠を突き破る必要があります');
    assert.ok(v110.fill.right < v110.wrapper.right - 2, '110は120最大端より手前で止まる必要があります');
    approx(v120.fill.right, v120.wrapper.right, 2.0, '120は予約領域の右端に到達する必要があります');
}

async function main() {
    const browser = findBrowser();
    if (!browser) throw new Error('Chrome / Chromium / Edge が見つかりません。CHROME_PATH を指定してください。');
    const port = await freePort();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sengoku-visual-'));
    const userData = path.join(tempDir, 'profile');
    const args = [
        '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
        '--remote-allow-origins=*', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, 'about:blank'
    ];
    if (process.platform !== 'win32') args.push('--no-sandbox');
    const child = spawn(browser, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    let cdp;
    try {
        const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
        const page = pages.find(item => item.type === 'page');
        assert.ok(page && page.webSocketDebuggerUrl, 'DevTools page endpoint がありません');
        cdp = new CDPClient(page.webSocketDebuggerUrl);
        await cdp.open();
        await cdp.call('Runtime.enable');
        await cdp.call('Page.enable');
        await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
        const html = fixtureHtml();
        await cdp.call('Runtime.evaluate', {
            expression: `document.open();document.write(${JSON.stringify(html)});document.close();true`,
            returnByValue: true,
            awaitPromise: true
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        const expression = `(() => {
            const right = document.getElementById('right-column').getBoundingClientRect();
            return [...document.querySelectorAll('[data-value]')].map(row => {
                const wrapper = row.querySelector('.busho-stat-bar-wrapper').getBoundingClientRect();
                const base = row.querySelector('.bar-bg-busho').getBoundingClientRect();
                const fill = row.querySelector('.bar-fill-busho').getBoundingClientRect();
                const rr = row.getBoundingClientRect();
                return { value:Number(row.dataset.value), wrapper:{left:wrapper.left,right:wrapper.right,width:wrapper.width,height:wrapper.height}, base:{left:base.left,right:base.right,width:base.width,height:base.height}, fill:{left:fill.left,right:fill.right,width:fill.width,height:fill.height}, row:{right:rr.right}, rightColumnLeft:right.left };
            });
        })()`;
        const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
        const rows = result.result && result.result.value;
        assert.ok(Array.isArray(rows), 'ブラウザからゲージ寸法を取得できませんでした');
        validate(rows);

        const shot = await cdp.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
        const screenshot = path.join(tempDir, 'busho_gauge.png');
        fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
        assert.ok(fs.statSync(screenshot).size > 4000, '確認用スクリーンショットが空に近いです');
        if (process.env.KEEP_VISUAL_SCREENSHOT === '1') {
            const keep = path.join(ROOT, 'tests', 'visual', 'last_busho_gauge.png');
            fs.copyFileSync(screenshot, keep);
            console.log(`  screenshot: ${keep}`);
        }
        console.log('✓ PC武将能力ゲージ visual/layout regression');
        console.log('  80/100/110/120 の幅・高さ・限界突破・右列非侵入を実ブラウザで確認しました');
    } finally {
        if (cdp) cdp.close();
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 400).unref();
    }
}

main().catch(error => {
    console.error('✗ visual test failed');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
