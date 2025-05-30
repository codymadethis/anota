const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.')); // Serve static files from current directory

// In-memory store for annotations
const store = new Map();

// Create a new share
app.post('/api/share', (req, res) => {
    const { image, annotations } = req.body;
    if (!image) {
        return res.status(400).json({ error: 'Image is required' });
    }

    const id = uuidv4();
    store.set(id, { image, annotations: annotations || [], createdAt: Date.now() });
    
    // Clean up old entries (older than 24 hours)
    const oneDay = 24 * 60 * 60 * 1000;
    for (const [key, value] of store.entries()) {
        if (Date.now() - value.createdAt > oneDay) {
            store.delete(key);
        }
    }

    res.json({ id });
});

// Get a share by ID
app.get('/api/share/:id', (req, res) => {
    const { id } = req.params;
    const data = store.get(id);
    
    if (!data) {
        return res.status(404).json({ error: 'Share not found' });
    }

    res.json(data);
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 