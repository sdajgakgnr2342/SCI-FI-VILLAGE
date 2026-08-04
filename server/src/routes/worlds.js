const express = require('express');
const worldController = require('../controllers/worldController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired);

router.get('/', worldController.list);
router.post('/', worldController.create);
router.get('/blocks/query', worldController.blocks);
router.post('/blocks', worldController.placeBlock);
router.get('/:id', worldController.detail);

module.exports = router;
