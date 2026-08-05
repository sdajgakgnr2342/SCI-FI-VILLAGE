const express = require('express');
const worldController = require('../controllers/worldController');
const controlLayoutController = require('../controllers/controlLayoutController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired);

router.put('/position', worldController.updatePosition);
router.get('/inventory', worldController.inventory);

router.get('/controls', controlLayoutController.getMine);
router.put('/controls', controlLayoutController.saveMine);
router.post('/controls/share', controlLayoutController.share);
router.post('/controls/import', controlLayoutController.importCode);

module.exports = router;
