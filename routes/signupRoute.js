const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/', (req, res) => {
   req.params.first_name = req.body.first_name;
   req.params.last_name = req.body.last_name;
   req.params.email = req.body.email;
   req.params.password = req.body.password;
   console.log(req.params.first_name, req.params.last_name, req.params.email, req.params.password);
   pool.query('INSERT INTO users (first_name, last_name, email, password) VALUES ($1, $2, $3, $4)', [req.params.first_name, req.params.last_name, req.params.email, req.params.password], (err, result) => {
    if (err) {
        console.error('Error inserting user', err);
        res.status(500).json({ error: 'Error inserting user' });
    } else {
        res.status(200).json({ message: 'User inserted successfully' });
    }
});
});
module.exports = router;
