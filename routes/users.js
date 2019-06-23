var express = require('express');
var router = express.Router();
const common = require('./common');
const User = require('../model').User;

/* 
Init user account, get's called only one time during app start for first time
init wallet if it does not exist already.
accepts post body
{name: "User name here", info: 'Something else, extra line'}
return user_id; // generated user id
*/
router.post('/', (req, res, next) => {
  const {name, info} = req.body;
  User.create({name: name, info: info}).then(userResults => {
    let urValues = userResults.dataValues;
    const uid = urValues.id;
    // we are filthy rich giving away money to everyone
    common.generateWallet(uid, '50.0000', 'end', (err, walletResult) => {
      if(err) {
        res.status(500);
        return res.end();
      }
      return res.jsonp({success: true, data: {uid:uid} });
    });
  });
});

/*
saves firebase token for the account
{uid: user_id, token: 'firebase_token'} // returned during /init
*/
router.post('/token', common.uidCheck, (req, res, next) => {
  return res.jsonp({success: true});
});


// basic info, Name of the user
router.get('/:uid', (req, res, next) => {
  common.findUserById(req.params.uid, (err, result) => {
    if(err) {
      res.status(404);
      res.end();  
      return;
    }
    return res.jsonp({success: true, data: result.dataValues});
  });
});

module.exports = router;
