var express = require('express');
var router = express.Router();
const common = require('./common');

router.get('/user/:uid', (req, res, next) => {
  let uid = req.params.uid;
  common.findUserById(uid, (err, result) => {
    if(err) {
      res.status(404);
      return res.end();
    }
    return res.jsonp({success: true, data: result});
  })
});

router.get('/contract/:cid', (req, res, next) => {
  res.status(404);
  return res.end();
});

module.exports = router;