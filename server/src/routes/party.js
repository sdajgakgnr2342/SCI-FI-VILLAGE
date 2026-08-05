const express = require('express');
const partyController = require('../controllers/partyController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/mine', partyController.mine);
router.post('/invite', partyController.invite);
router.post('/invites/:id/accept', partyController.accept);
router.post('/invites/:id/decline', partyController.decline);
router.post('/leave', partyController.leave);
router.post('/enter', partyController.enter);

module.exports = router;
