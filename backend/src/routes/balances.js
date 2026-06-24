const express = require('express');
const { computeGroupBalances } = require('../utils/computeBalances');
const { assertMembership } = require('../middleware/membership');

const router = express.Router();

// C2 — assertMembership via req.params.groupId
router.get('/group/:groupId', assertMembership, async (req, res, next) => {
  try {
    const balances = await computeGroupBalances(req.params.groupId);
    res.json(balances);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
