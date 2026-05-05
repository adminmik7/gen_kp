const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 8000;

app.use(express.json());
app.use(express.static(__dirname)); // ����� index.html � aut.html

// �������� ������ �������������
app.get('/api/users', (req, res) => {
    fs.readFile(path.join(__dirname, 'db.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: '�� ������� ��������� db.json' });
        }
        res.json(JSON.parse(data));
    });
});

// �������� ������ �������������
app.post('/api/users', (req, res) => {
    console.log('[POST /api/users] Body:', JSON.stringify(req.body).substring(0, 200));
    const newUsers = req.body.users;
    if (!newUsers) {
        console.log('[POST /api/users] ERROR: users field missing');
        return res.status(400).json({ error: 'Отсутствует поле users' });
    }
    if (!Array.isArray(newUsers)) {
        console.log('[POST /api/users] ERROR: users is not array, type:', typeof newUsers);
        return res.status(400).json({ error: 'users должен быть массивом' });
    }

    fs.readFile(path.join(__dirname, 'db.json'), 'utf8', (err, data) => {
        if (err) {
            console.log('[POST /api/users] ERROR reading db.json:', err.message);
            return res.status(500).json({ error: 'Ошибка чтения db.json' });
        }
        let db;
        try {
            db = JSON.parse(data);
        } catch (parseErr) {
            console.log('[POST /api/users] ERROR parsing db.json:', parseErr.message);
            return res.status(500).json({ error: 'Ошибка парсинга db.json' });
        }
        db.users = newUsers;
        fs.writeFile(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2), 'utf8', (err) => {
            if (err) {
                console.log('[POST /api/users] ERROR writing db.json:', err.message);
                return res.status(500).json({ error: 'Ошибка записи db.json' });
            }
            console.log('[POST /api/users] SUCCESS, users count:', newUsers.length);
            res.json({ success: true });
        });
    });
});

app.listen(PORT, () => {
    console.log(`������ ������� �� http://localhost:${PORT}`);
});