const express = require('express');
const serverController = require('../controllers/serverController');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired);

router.get('/', serverController.list);
router.post('/join', serverController.join);
router.post('/leave', serverController.leave);
router.post('/heartbeat', serverController.heartbeat);
router.get('/nearby', serverController.nearby);
router.get('/blocks', serverController.queryBlocks);
router.post('/blocks', serverController.saveBlocks);
router.get('/:id', serverController.detail);

module.exports = router;
