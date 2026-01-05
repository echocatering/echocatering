const express = require('express');
const { getCountries, isValidCountryCode } = require('../utils/countries');

const router = express.Router();

// @route   GET /api/countries
// @desc    List countries; supports ?q=search and ?codes=US,FR
// @access  Public
router.get('/', (req, res) => {
  const { q, codes } = req.query;
  let countries = getCountries();

  if (codes) {
    const list = String(codes)
      .split(',')
      .map(c => c.trim().toUpperCase())
      .filter(Boolean)
      .filter(isValidCountryCode);
    countries = countries.filter(c => list.includes(c.code));
  }

  if (q) {
    const query = String(q).toLowerCase();
    countries = countries.filter(c =>
      c.code.toLowerCase().includes(query) ||
      (c.name && c.name.toLowerCase().includes(query))
    );
  }

  res.json(countries);
});

module.exports = router;
















