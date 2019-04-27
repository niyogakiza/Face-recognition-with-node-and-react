// load environment variables from .env file, if it exists
require('dotenv').config();

const express = require('express');
const app = express();
const path = require('path');
const util = require('util');
const fs = require('fs');
const multer = require('multer');
const { ImageAnnotatorClient } = require('@google-cloud/vision');

/* Promisify the filesystem functions we need */
const readdirAsync = util.promisify(fs.readdir);
const statAsync = util.promisify(fs.stat);
const unlinkAsync = util.promisify(fs.unlink);

fs.writeFileSync(path.join(__dirname, 'face-recognition-node-react-64be668ee350.json'), process.env.SERVICE_ACCOUNT_JSON);

/* create cloud vision client */
const visionClient = new ImageAnnotatorClient();
//defining path for file uploads
const uploadPath = path.join(__dirname, 'uploads');

// Create the upload folder if it doesn't exist
if(!fs.existsSync(uploadPath)){
    fs.mkdirSync(uploadPath);
}

// Create the upload folder if it doesn't exist
const upload =  multer({ dest: 'uploads/' });

// handle post requests with images to the /upload path
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            res.sendStatus(500);
        }
        // get the file path uploaded via multer
        const filePath = req.file.path;

        // send the image to gcloud for label detection
        const results = await visionClient.labelDetection(filePath);

        // pull label data out of the response from google
        const labels = results[0].labelAnnotations.map(x => x.description.toLowerCase());

        // check if we can have cat
        const hasCat = labels.includes('cat');
        if (hasCat) {
            res.status(201).json({
                message: 'We got cat.'
            })
        } else {
            // remove the no-cat from our server
            await unlinkAsync(filePath);
            res.status(400).json({
                message: 'Must be only cats'
            })
        }
    } catch (e) {
        console.table(e);
        res.sendStatus(500);
    }
});

// handle requests to individual cats
app.get('/api/cats/:id', (req, res) => {
    const { id } = req.params;
    const catPath = path.join(uploadPath, id);
    res.sendFile(catPath)
});

// handle get requests to retrieve the last uploaded cat
app.get('/api/cats', async (req, res) => {
    try {
        // read our uploads directory for files
        const files = await readdirAsync(uploadPath);

        // read file stats asynchronously
        const stats = await Promise.all(
            files.map(filename => statAsync(path.join(uploadPath, filename))
                .then(stat => ({ filename, stat }))
            )
        );
        // sort files chronologically and slice the last 20
        const cats = stats
            .sort((a, b) => a.stat.mtime.getTime() - b.stat.mtime.getTime())
            .map(stat => stat.filename);
        res.status(200).json({ cats, message: 'Some cats'})
    } catch (e) {
        console.error(e);
        // if there's an error, just send an empty array
        res.status(500).json({ cats: [], message: 'Internal server error'});
    }
});


app.use(express.static(path.join(__dirname, '../client/build')));
const port = process.env.PORT || 8080;
app.listen(port, () => console.table(`Server running on port ${port}`));

