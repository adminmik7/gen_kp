const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = 8000;

const CACHE_TTL = 5 * 60 * 1000;
const userCache = new Map();
const envCache = new Map();
const filesCache = new Map();

app.use(express.json());
app.use(express.static(__dirname));

async function getCachedUsers() {
    const cached = userCache.get('users');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    let db;
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'db.json'), 'utf8');
        db = JSON.parse(data);
    } catch (err) {
        return res.status(500).json({ error: 'Ошибка чтения db.json' });
    }
    userCache.set('users', { data: db.users, timestamp: Date.now() });
    return db.users;
}

async function getCachedEnv() {
    const cached = envCache.get('env');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    let env;
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'env.json'), 'utf8');
        env = JSON.parse(data);
    } catch (err) {
        return res.status(500).json({ error: 'Ошибка чтения env.json' });
    }
    envCache.set('env', { data: env, timestamp: Date.now() });
    return env;
}

async function getCachedFiles() {
    const cached = filesCache.get('files');
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    const KP_FILES_DIR = path.join(__dirname, 'kp-files');
    if (!fs.existsSync(KP_FILES_DIR)) {
        fs.mkdirSync(KP_FILES_DIR, { recursive: true });
    }
    const files = await fs.promises.readdir(KP_FILES_DIR, { withFileTypes: true });
    const jsonFiles = files
        .filter(f => f.isFile() && f.name.endsWith('.json'))
        .map(f => f.name);
    filesCache.set('files', { data: jsonFiles, timestamp: Date.now() });
    return jsonFiles;
}

app.get('/api/users', async (req, res) => {
    try {
        const users = await getCachedUsers();
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка чтения db.json' });
    }
});

app.post('/api/users', async (req, res) => {
    const newUsers = req.body.users;
    if (!newUsers) {
        return res.status(400).json({ error: 'Отсутствует поле users' });
    }
    if (!Array.isArray(newUsers)) {
        return res.status(400).json({ error: 'users должен быть массивом' });
    }

    let db;
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'db.json'), 'utf8');
        db = JSON.parse(data);
    } catch (err) {
        return res.status(500).json({ error: 'Ошибка чтения db.json' });
    }
    db.users = newUsers;
    try {
        await fs.promises.writeFile(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2), 'utf8');
        userCache.delete('users');
        res.json({ success: true });
    } catch (err) {
        console.error('[POST /api/users] ERROR writing db.json:', err.message);
        return res.status(500).json({ error: 'Ошибка записи db.json' });
    }
});

app.post('/api/env', async (req, res) => {
    const envData = req.body;
    if (!envData || !envData.conditions) {
        return res.status(400).json({ error: 'Отсутствует поле conditions' });
    }

    let env;
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'env.json'), 'utf8');
        env = JSON.parse(data);
    } catch (err) {
        return res.status(500).json({ error: 'Ошибка чтения env.json' });
    }
    env.conditions = envData.conditions;
    try {
        await fs.promises.writeFile(path.join(__dirname, 'env.json'), JSON.stringify(env, null, 2), 'utf8');
        envCache.delete('env');
        res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Ошибка записи env.json' });
    }
});

app.get('/api/env', async (req, res) => {
    try {
        const env = await getCachedEnv();
        res.json(env);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка чтения env.json' });
    }
});

// ========== API для работы с файлами КП ==========
const KP_FILES_DIR = path.join(__dirname, 'kp-files');

if (!fs.existsSync(KP_FILES_DIR)) {
    fs.mkdirSync(KP_FILES_DIR, { recursive: true });
}

app.get('/api/files', async (req, res) => {
    try {
        const fileList = await getCachedFiles();
        
        const fileDetails = await Promise.all(
            fileList.map(async (filename) => {
                const filePath = path.join(KP_FILES_DIR, filename);
                const stats = await fs.promises.stat(filePath);
                return {
                    name: filename,
                    size: stats.size,
                    date: stats.birthtime,
                    modifiedAt: stats.mtime
                };
            })
        );
        
        res.json({ success: true, files: fileDetails });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка чтения директории' });
    }
});

app.get('/api/files/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(KP_FILES_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Файл не найден' });
    }

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(data);
        res.json({ success: true, data: jsonData });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка чтения файла' });
    }
});

app.delete('/api/files/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(KP_FILES_DIR, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Файл не найден' });
    }

    try {
        await fs.promises.unlink(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка удаления файла' });
    }
});

app.post('/api/files', async (req, res) => {
    const data = req.body;
    if (!data || !data.meta) {
        return res.status(400).json({ success: false, error: 'Отсутствуют данные' });
    }

    // Фильтруем base64 данные перед сохранением
    const filteredData = JSON.parse(JSON.stringify(data));
    if (filteredData.logo && filteredData.logo.startsWith('data:image/')) {
        filteredData.logo = '';
    }
    if (filteredData.signature && filteredData.signature.startsWith('data:image/')) {
        filteredData.signature = '';
    }

    const customer = (filteredData.meta.customer || 'Без_заказчика').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_').replace(/_+/g, '_');
    const kpNum = filteredData.meta.kpNumber || '1';
    const date = filteredData.meta.date || new Date().toISOString().split('T')[0];
    const fileName = `${customer}_${kpNum}_${date}.json`;
    const filePath = path.join(KP_FILES_DIR, fileName);

    try {
        await fs.promises.writeFile(filePath, JSON.stringify(filteredData, null, 2), 'utf8');
        res.json({ success: true, filename: fileName });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Ошибка записи файла' });
    }
});

app.listen(PORT, () => {
    console.log(`������ ������� �� http://localhost:${PORT}`);
});