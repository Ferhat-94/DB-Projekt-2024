const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config(); //.env

const app = express();

app.use(cors({
    origin: 'https://ferhat-94.github.io',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // Cookies
}));

app.use(express.json());

// MySQL-Verbindung
const db = mysql.createConnection({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER, 
    password: process.env.DATABASE_PASSWORD, 
    database: process.env.DATABASE_NAME, 
    port: process.env.DATABASE_PORT || 3306, 
});

// Verbindung testen
db.connect(err => {
    if (err) {
        console.error('Fehler bei der Verbindung zur Datenbank:', err.message);
    } else {
        console.log('Datenbankverbindung erfolgreich!');
    }
});

// API-Endpunkte

// Allgemeine Queries
app.get('/query/:id', (req, res) => {
    const queryId = parseInt(req.params.id);

    let sql = '';
    switch (queryId) {
        case 1: // Benutzer abfragen
            sql = 'SELECT * FROM Benutzer';
            break;
        case 2: // Produkte abfragen
            sql = 'SELECT Produktname, Kategorie, Preis, Nutzung FROM Produkt';
            break;
        default:
            res.status(400).send({ error: 'Ungültige Abfrage-ID' });
            return;
    }

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Fehler bei der Abfrage:', err.message);
            res.status(500).send({ error: 'Fehler bei der Datenbankabfrage' });
        } else {
            res.json(results);
        }
    });
});

// Suche in der Datenbank
app.get('/search', (req, res) => {
    const searchQuery = req.query.query;

    if (!searchQuery) {
        res.status(400).send({ error: 'Kein Suchbegriff angegeben' });
        return;
    }

    // SQL-Abfrage für die Suche
    const sql = `
        SELECT 'Benutzer' AS Typ, Vorname, Nachname, EMail
        FROM Benutzer
        WHERE Vorname LIKE ? OR Nachname LIKE ? OR EMail LIKE ?
        UNION
        SELECT 'Produkt' AS Typ, Produktname, Kategorie, Preis
        FROM Produkt
        WHERE Produktname LIKE ? OR Kategorie LIKE ?
    `;

    const likeQuery = `%${searchQuery}%`;
    db.query(sql, [likeQuery, likeQuery, likeQuery, likeQuery, likeQuery], (err, results) => {
        if (err) {
            console.error('Fehler bei der Abfrage:', err.message);
            res.status(500).send({ error: 'Fehler bei der Datenbankabfrage' });
        } else {
            res.json(results);
        }
    });
});

// Statische Dateien bereitstellen
app.use(express.static(path.join(__dirname, 'docs')));

// Standardroute für "/"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname,'docs', 'index.html'));
});


// Anmelde-Endpoint
app.post('/admin/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send({ error: 'E-Mail und Passwort sind erforderlich.' });
    }

    const sql = 'SELECT * FROM Benutzer WHERE E_Mail_Adresse = ?';
    db.query(sql, [email], (err, results) => {
        if (err) {
            console.error('Fehler bei der Datenbankabfrage:', err.message);
            return res.status(500).send({ error: 'Interner Serverfehler.' });
        }

        if (results.length === 0) {
            return res.status(401).send({ error: 'Ungültige E-Mail-Adresse oder Passwort.' });
        }

        const user = results[0];

        // Überprüfen der Rolle
        if (user.Rolle !== 'Admin') {
            return res.status(403).send({ error: 'Zugriff verweigert: Keine Admin-Berechtigung.' });
        }

        // Klartext-Passwortvergleich
        if (password !== user.Password) {
            return res.status(401).send({ error: 'Ungültige E-Mail-Adresse oder Passwort.' });
        }

        res.send({ message: 'Anmeldung erfolgreich.', userId: user.User_ID });
    });
});
// Admin Dashboard Zugriff
app.get('/admin/dashboard', (req, res) => {
    const adminId = req.headers['x-user-id'];

    if (!adminId) {
        return res.status(401).send({ error: 'Nicht autorisiert.' });
    }

    const sql = 'SELECT * FROM Benutzer WHERE User_ID = ?';
    db.query(sql, [adminId], (err, results) => {
        if (err) {
            console.error('Fehler bei der Datenbankabfrage:', err.message);
            return res.status(500).send({ error: 'Interner Serverfehler.' });
        }

        if (results.length === 0) {
            return res.status(401).send({ error: 'Nicht autorisiert.' });
        }

        const user = results[0];
        if (user.Rolle !== 'Admin') {
            return res.status(403).send({ error: 'Zugriff verweigert: Keine Admin-Berechtigung.' });
        }

        res.send({ message: `Willkommen im Admin-Bereich, ${user.Vorname} ${user.Nachname}!` });
    });
});





app.post('/inventar/query', (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).send({ error: 'SQL-Abfrage fehlt.' });
    }

    db.query(query, (err, results) => {
        if (err) {
            console.error('Fehler bei der SQL-Abfrage:', err.message);
            return res.status(500).send({ error: 'Fehler bei der Abfrage. Überprüfen Sie Ihre SQL-Syntax.' });
        }

        res.json(results);
    });
});


//Produkte Get, Post, Put, Delete

// GET: Alle Produkte im Lagerbestand abrufen
app.get('/inventar', (req, res) => {
    const sql = `
        SELECT 
            p.Product_ID,
            p.Produktname AS Name,
            p.Kategorie,
            p.Preis,
            p.Hersteller,
            p.Produktbeschreibung AS Description,
            pg.Produktgroesse AS Size,
            COALESCE(lb.Menge, 0) AS Stock
        FROM Produkt p
        LEFT JOIN ProduktProduktgroesse pg ON p.Product_ID = pg.Product_ID
        LEFT JOIN Lagerbestand lb ON pg.Size_ID = lb.Size_ID AND lb.Product_ID = p.Product_ID;
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Fehler beim Abrufen des Lagerbestands:', err.message);
            return res.status(500).send({ error: 'Fehler beim Abrufen des Lagerbestands.' });
        }

        res.json(results);
    });
});

// POST-Request
app.post('/inventar', (req, res) => {
    const { productId, name, category, price, size, stock, manufacturer, description, usage } = req.body;

    db.beginTransaction(err => {
        if (err) {
            console.error('Fehler beim Starten der Transaktion:', err.message);
            return res.status(500).send({ error: 'Fehler beim Speichern des Produkts.' });
        }

        // Produkt speichern
        const productSql = `
            INSERT INTO Produkt (Product_ID, Produktname, Kategorie, Preis, Hersteller, Produktbeschreibung, Nutzung) 
            VALUES (?, ?, ?, ?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
                Produktname = VALUES(Produktname), 
                Kategorie = VALUES(Kategorie), 
                Preis = VALUES(Preis), 
                Hersteller = VALUES(Hersteller), 
                Produktbeschreibung = VALUES(Produktbeschreibung), 
                Nutzung = VALUES(Nutzung);
        `;
        db.query(productSql, [productId, name, category, price, manufacturer, description, usage], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Fehler beim Speichern des Produkts:', err.message);
                    res.status(500).send({ error: 'Fehler beim Speichern des Produkts.' });
                });
            }

            
            const insertedProductId = productId || result.insertId;

            const trimmedSize = size.trim(); //trim

            // Grösse speichern
            const sizeSql = `
                INSERT INTO Produktgroesse (Product_ID, Produktgroesse, Lagerbestand) 
                VALUES (?, ?, ?) 
                ON DUPLICATE KEY UPDATE 
                    Produktgroesse = VALUES(Produktgroesse), 
                    Lagerbestand = VALUES(Lagerbestand);
            `;
            db.query(sizeSql, [insertedProductId, trimmedSize, stock], (err) => {
                if (err) {
                    return db.rollback(() => {
                        console.error('Fehler beim Speichern der Grösse:', err.message);
                        res.status(500).send({ error: 'Fehler beim Speichern der Grösse.' });
                    });
                }

                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Fehler beim Abschliessen der Transaktion:', err.message);
                            res.status(500).send({ error: 'Fehler beim Speichern des Produkts.' });
                        });
                    }
                    res.status(201).send({ message: 'Produkt erfolgreich gespeichert.' });
                });
            });
        });
    });
});

// PUT-Request
app.put('/inventar', (req, res) => {
    const { productId, productName, category, price, size, stock } = req.body;

    // Validierung der Eingaben
    if (!productId || !productName || !category || price == null || !size || stock == null) {
        return res.status(400).send({ error: 'Alle Felder (Produkt-ID, Name, Kategorie, Preis, Grösse, Bestand) sind erforderlich.' });
    }

    const sql = `
        UPDATE Produkt p
        JOIN Lagerbestand lb ON p.Product_ID = lb.Product_ID
        JOIN ProduktProduktgroesse pg ON lb.Size_ID = pg.Size_ID
        SET 
            p.Produktname = ?, 
            p.Kategorie = ?, 
            p.Preis = ?, 
            pg.Produktgroesse = ?, 
            lb.Menge = ?
        WHERE p.Product_ID = ? AND pg.ProduktProduktgroesse = ?;
    `;

    const params = [productName, category, price, size, stock, productId, size];

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Fehler beim Aktualisieren des Produkts:', err.message);
            return res.status(500).send({ error: 'Fehler beim Aktualisieren des Produkts.' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).send({ error: 'Produkt oder Grösse nicht gefunden.' });
        }

        res.send({ message: 'Produkt erfolgreich aktualisiert.' });
    });
});

// DELETE-Rquest
app.delete('/inventar/:productId/:size', (req, res) => {
    const { productId, size } = req.params;

    if (!productId || !size) {
        return res.status(400).send({ error: 'Product_ID und Grösse sind erforderlich.' });
    }

    const sizeSql = `
        SELECT Size_ID FROM Produktgroesse 
        WHERE Product_ID = ? AND Produktgroesse = ?;
    `;
    db.query(sizeSql, [productId, size], (err, results) => {
        if (err) {
            console.error('Fehler beim Nachschlagen der Grösse:', err.message);
            return res.status(500).send({ error: 'Fehler beim Nachschlagen der Grösse.' });
        }

        if (results.length === 0) {
            return res.status(404).send({ error: 'Grösse nicht gefunden.' });
        }

        const sizeId = results[0].Size_ID;

        const deleteSql = `
            DELETE FROM Lagerbestand 
            WHERE Product_ID = ? AND Size_ID = ?;
        `;
        db.query(deleteSql, [productId, sizeId], (err) => {
            if (err) {
                console.error('Fehler beim Löschen des Produkts:', err.message);
                return res.status(500).send({ error: 'Fehler beim Löschen des Produkts.' });
            }
            res.send({ message: 'Produkt erfolgreich gelöscht.' });
        });
    });
});

// Benutzer Get, Post, Put, Delete

// GET-Request Benutzer
app.get('/users', (req, res) => {
    const sql = `
        SELECT User_ID, Vorname, Nachname, E_Mail_Adresse, Telefonnummer, Strasse, PLZ, Ort, Registrierung, Rolle, Rabatt, Geburtsdatum 
        FROM Benutzer;
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Fehler beim Abrufen der Benutzer:', err.message);
            return res.status(500).send({ error: 'Fehler beim Abrufen der Benutzer.' });
        }
        res.json(results);
    });
});

// POST-Request Benutzer
app.post('/users', (req, res) => {
    const { userId, Vorname, Nachname, E_Mail_Adresse, Telefonnummer, Strasse, PLZ, Ort, Rolle, Rabatt, Geburtsdatum } = req.body;

    if (!Vorname || !Nachname || !E_Mail_Adresse || !Rolle || Rabatt == null) {
        return res.status(400).send({ error: 'Alle Felder (Vorname, Nachname, E-Mail-Adresse, Rolle, Rabatt) sind erforderlich.' });
    }

    // Standardpasswort
    const defaultPassword = bcrypt.hashSync('password12', 10);

    const sql = `
        INSERT INTO Benutzer (User_ID, Vorname, Nachname, E_Mail_Adresse, Telefonnummer, Strasse, PLZ, Ort, Rolle, Rabatt, Geburtsdatum, Password) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE 
            Vorname = VALUES(Vorname), 
            Nachname = VALUES(Nachname), 
            E_Mail_Adresse = VALUES(E_Mail_Adresse), 
            Telefonnummer = VALUES(Telefonnummer), 
            Strasse = VALUES(Strasse), 
            PLZ = VALUES(PLZ), 
            Ort = VALUES(Ort), 
            Rolle = VALUES(Rolle), 
            Rabatt = VALUES(Rabatt), 
            Geburtsdatum = VALUES(Geburtsdatum);
    `;
    db.query(sql, [userId || null, Vorname, Nachname, E_Mail_Adresse, Telefonnummer, Strasse, PLZ, Ort, Rolle, Rabatt, Geburtsdatum, defaultPassword], (err) => {
        if (err) {
            console.error('Fehler beim Speichern des Benutzers:', err.message);
            return res.status(500).send({ error: 'Fehler beim Speichern des Benutzers.' });
        }
        res.status(201).send({ message: 'Benutzer erfolgreich gespeichert.' });
    });
});

// PUT-Request Benutzer
app.put('/users/:id', (req, res) => {
    const userId = req.params.id;
    const { Vorname, Nachname, E_Mail_Adresse, Telefonnummer, Strasse, PLZ, Ort, Rolle, Rabatt, Geburtsdatum } = req.body;

    if (!Vorname || !Nachname || !E_Mail_Adresse || !Rolle || Rabatt == null) {
        return res.status(400).send({ error: 'Alle Felder (Vorname, Nachname, E-Mail-Adresse, Rolle, Rabatt) sind erforderlich.' });
    }

    const sql = `
        UPDATE Benutzer 
        SET Vorname = ?, Nachname = ?, E_Mail_Adresse = ?, Telefonnummer = ?, Strasse = ?, PLZ = ?, Ort = ?, Rolle = ?, Rabatt = ?, Geburtsdatum = ? 
        WHERE User_ID = ?;
    `;
    db.query(sql, [Vorname, Nachname, E_Mail_Adresse, Telefonnummer, Strasse, PLZ, Ort, Rolle, Rabatt, Geburtsdatum, userId], (err) => {
        if (err) {
            console.error('Fehler beim Aktualisieren des Benutzers:', err.message);
            return res.status(500).send({ error: 'Fehler beim Aktualisieren des Benutzers.' });
        }
        res.send({ message: 'Benutzer erfolgreich aktualisiert.' });
    });
});

// DELETE-Request Benutzer
app.delete('/users/:id', (req, res) => {
    const userId = req.params.id;

    const sql = `
        DELETE FROM Benutzer 
        WHERE User_ID = ?;
    `;
    db.query(sql, [userId], (err) => {
        if (err) {
            console.error('Fehler beim Löschen des Benutzers:', err.message);
            return res.status(500).send({ error: 'Fehler beim Löschen des Benutzers.' });
        }
        res.send({ message: 'Benutzer erfolgreich gelöscht.' });
    });
});


app.post('/orders', (req, res) => {
    const { User_ID, items, Lieferstatus, Versandkosten, Rabatt } = req.body;

    if (!User_ID || !items || items.length === 0) {
        return res.status(400).send({ error: 'Benutzer-ID und Artikel sind erforderlich.' });
    }

    // Berechnung der Gesamtkosten
    let Gesamtkosten = 0;
    items.forEach(item => {
        Gesamtkosten += item.Menge * item.Einzelpreis;
    });

    Gesamtkosten = Gesamtkosten - Rabatt + Versandkosten;

    db.beginTransaction(err => {
        if (err) {
            console.error('Fehler beim Starten der Transaktion:', err.message);
            return res.status(500).send({ error: 'Fehler beim Speichern der Bestellung.' });
        }

        // Bestellung einfügen
        const orderSql = `
            INSERT INTO Bestellung (User_ID, Bestelldatum, Gesamtkosten, Lieferstatus, Versandkosten, Rabatt) 
            VALUES (?, NOW(), ?, ?, ?, ?)
        `;
        db.query(orderSql, [User_ID, Gesamtkosten, Lieferstatus, Versandkosten, Rabatt], (err, result) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Fehler beim Speichern der Bestellung:', err.message);
                    res.status(500).send({ error: 'Fehler beim Speichern der Bestellung.' });
                });
            }

            const Order_ID = result.insertId;

            // Bestellpositionen einfügen
            const orderItemsSql = `
                INSERT INTO Bestellposition (Order_ID, Product_ID, Size_ID, Menge, Einzelpreis) 
                VALUES ?
            `;
            const orderItems = items.map(item => [
                Order_ID, item.Product_ID, item.Size_ID, item.Menge, item.Einzelpreis
            ]);

            db.query(orderItemsSql, [orderItems], err => {
                if (err) {
                    return db.rollback(() => {
                        console.error('Fehler beim Speichern der Bestellpositionen:', err.message);
                        res.status(500).send({ error: 'Fehler beim Speichern der Bestellpositionen.' });
                    });
                }

                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Fehler beim Abschluss der Transaktion:', err.message);
                            res.status(500).send({ error: 'Fehler beim Speichern der Bestellung.' });
                        });
                    }
                    res.status(201).send({ message: 'Bestellung erfolgreich erstellt.', Order_ID });
                });
            });
        });
    });
});

app.get('/orders', (req, res) => {
    const User_ID = req.query.User_ID;

    let sql = `
        SELECT 
            o.Order_ID, o.User_ID, o.Bestelldatum, o.Gesamtkosten, o.Lieferstatus, o.Versandkosten, o.Rabatt,
            p.Order_Item_ID, p.Product_ID, p.Size_ID, p.Menge, p.Einzelpreis
        FROM Bestellung o
        LEFT JOIN Bestellposition p ON o.Order_ID = p.Order_ID
    `;
    const params = [];

    if (User_ID) {
        sql += ' WHERE o.User_ID = ?';
        params.push(User_ID);
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Fehler beim Abrufen der Bestellungen:', err.message);
            return res.status(500).send({ error: 'Fehler beim Abrufen der Bestellungen.' });
        }
        res.json(results);
    });
});

app.put('/orders/:Order_ID/status', (req, res) => {
    const { Order_ID } = req.params;
    const { Lieferstatus } = req.body;

    if (!Lieferstatus) {
        return res.status(400).send({ error: 'Lieferstatus ist erforderlich.' });
    }

    const sql = `
        UPDATE Bestellung 
        SET Lieferstatus = ?
        WHERE Order_ID = ?
    `;
    db.query(sql, [Lieferstatus, Order_ID], (err) => {
        if (err) {
            console.error('Fehler beim Aktualisieren des Lieferstatus:', err.message);
            return res.status(500).send({ error: 'Fehler beim Aktualisieren des Lieferstatus.' });
        }
        res.send({ message: 'Lieferstatus erfolgreich aktualisiert.' });
    });
});

// Statische Daten
app.use(express.static(path.join(__dirname, 'docs')));


// Server starten
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server läuft`);
});
