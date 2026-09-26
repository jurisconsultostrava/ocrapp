const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const Tesseract = require('tesseract.js');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Povolení CORS pro komunikaci s frontendem a navýšení limitu pro velké fotografie z mobilu
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Inicializace Google Drive OAuth / Service Account pomocí proměnných z Railway enviromentu
const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    ['https://googleapis.com']
);

const drive = google.drive({ version: 'v3', auth });

app.post('/api/ocr', async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ success: false, error: 'Chybí data obrázku.' });
        }

        // Vyčištění Base64 stringu
        const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        console.log("Spouštím proces OCR...");
        // Rozpoznávání textu v češtině ('ces')
        const { data: { text } } = await Tesseract.recognize(imageBuffer, 'ces');
        console.log("OCR úspěšně dokončeno.");

        // Vygenerování unikátního názvu textového souboru na základě času
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `doklad-${timestamp}.txt`;

        // Konverze čistého textu na stream pro nahrávání do cloudu
        const textStream = new Readable();
        textStream.push(text);
        textStream.push(null);

        console.log(`Nahrávám soubor ${filename} na Google Disk...`);
        
        const response = await drive.files.create({
            requestBody: {
                name: filename,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
                mimeType: 'text/plain'
            },
            media: {
                mimeType: 'text/plain',
                body: textStream
            }
        });

        console.log("Uloženo na Google Disk s ID:", response.data.id);
        res.json({ success: true, fileId: response.data.id, filename: filename });

    } catch (error) {
        console.error("Kritická chyba backendu:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 OCR Server úspěšně spuštěn na portu ${PORT}`);
});
