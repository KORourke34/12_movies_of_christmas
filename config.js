// config.js – the one place to change unlock dates (YYYY-MM-DD, door 1 first).
// These are only used the FIRST time the database is created; after that,
// change dates from the admin dashboard.
module.exports = {
  timezone: 'Europe/London', // "today" is worked out in this timezone
  dates: [
    '2026-12-13',
    '2026-12-14',
    '2026-12-15',
    '2026-12-16',
    '2026-12-17',
    '2026-12-18',
    '2026-12-19',
    '2026-12-20',
    '2026-12-21',
    '2026-12-22',
    '2026-12-23',
    '2026-12-24',
  ],
};
