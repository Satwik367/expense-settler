const express = require('express');
const { computeSettlements, listSettlements } = require('../controllers/settlementController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.post('/compute', computeSettlements);
router.get('/', listSettlements);

module.exports = router;