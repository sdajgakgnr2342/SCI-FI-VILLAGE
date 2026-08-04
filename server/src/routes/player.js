const express = require('express');
const worldController = require('../controllers/worldController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired);

router.put('/position', worldController.updatePosition);
router.get('/inventory', worldController.inventory);

module.exports = router;
