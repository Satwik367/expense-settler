const express = require('express');
const {
  computeSettlements,
  listSettlements,
  reportPayment,
  confirmPayment,
  rejectPayment,
} = require('../controllers/settlementController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.post('/compute', computeSettlements);
router.get('/', listSettlements);
router.post('/:settlementId/report', reportPayment);
router.post('/:settlementId/confirm', confirmPayment);
router.post('/:settlementId/reject', rejectPayment);

module.exports = router;