const Wallet = require('../model').Wallet;
const User = require('../model').User;

const kaoruConfig = require('../config');

const StellarSdk = require('stellar-sdk');
const kaoruSource = StellarSdk.Keypair.fromSecret(kaoruConfig.my.secret);
const server = new StellarSdk.Server(kaoruConfig.stellar);


StellarSdk.Network.useTestNetwork();

function generateWallet(userId, fund, kind, callback) {

  const destination = StellarSdk.Keypair.random();
  const memo = StellarSdk.Memo.text('Wallet init');
  server.accounts()
  .accountId(kaoruSource.publicKey())
  .call()
  .then(({ sequence }) => {
    const account = new StellarSdk.Account(kaoruSource.publicKey(), sequence);
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      memo: memo
    })
      .addOperation(StellarSdk.Operation.createAccount({
        destination: destination.publicKey(),
        startingBalance: fund
      }))
      .setTimeout(300)
      .build()
    transaction.sign(StellarSdk.Keypair.fromSecret(kaoruSource.secret()))
    return server.submitTransaction(transaction)
  })
  .then(results => {
    Wallet.create({user: userId, secret: destination.secret(), public: destination.publicKey(), balance: fund, kind: kind}).then(saveResult => {
      return callback(null, saveResult);
    });
  })
  .catch(err => {
    console.log('got eror', err);
    return callback(err, null);
  });
}

function userIdCheck(req, res, next) {
  console.log('came in check');
  if(!req.query.uid && !req.body.uid) {
    res.status(404);
    console.log('returnin ghere');
    return res.json({});
  }
  req.uid = req.query.uid ? req.query.uid : req.body.uid;
  next();
}

function attachWallet(req, res, next) {
  let userId = req.uid;
  Wallet.findOne({ where: {user: userId, kind: 'end'}}).then(wallet => {
    if(!wallet) {
      console.log('in here');
      res.status(404);
      return res.end();
    }
    req.wallet = wallet.dataValues;
    next();
  }).catch(err=> {
    console.log(err);
    res.status(404);
    return res.end();
  })
}

function findWalletForUser(uid, callback) {
  Wallet.findOne({ where: {user: uid, kind: 'end'}}).then(wallet => {
    if(!wallet) {
      return callback(null, false);
    }
    callback(null, wallet.dataValues);    
  }).catch(err => {
    callback(err, false);
  });
}

function findWalletForProvider(uid, callback) {
  Wallet.findOne({ where: {user: uid, kind: 'provider'}}).then(wallet => {
    if(!wallet) {
      return callback(null, false);
    }
    callback(null, wallet.dataValues);    
  }).catch(err => {
    callback(err, false);
  });
}

function findUserById(uid, callback) {
  User.findByPk(uid).then(userResult => {
    return callback(null, userResult, userResult.dataValues);
  }).catch(err => {
    return callback(err, null);

  });
}

function loadRealBalanceForWallet(walletPublic, callback) {
  server.loadAccount(walletPublic).then(account => {
    if(account.balances && account.balances.length) {
      const bal = account.balances[0];
      return callback(null, bal);
    } 
    return callback(null, false);
  }).catch(err => {
    console.log(err);
    return callback(err);
  });
}


const doPayment = (funder, reciever,  amount, memoText, callback) => {
  const memo = StellarSdk.Memo.text(memoText);
  server.accounts()
  .accountId(funder.public)
  .call()
  .then(({ sequence }) => {
    const account = new StellarSdk.Account(funder.public, sequence);
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      memo: memo
    })
    .addOperation(StellarSdk.Operation.payment({
      destination: reciever.public,
      asset: StellarSdk.Asset.native(),
      amount: amount
    }))
    .setTimeout(300)
    .build()
    transaction.sign(StellarSdk.Keypair.fromSecret(funder.secret))
    return server.submitTransaction(transaction)
  })
  .then(result => {
    return callback(null, result);
  })
  .catch(err => {
    console.log('#---- ', err.data);
    // console.log(err);
    return callback(err, null);
  });
};

module.exports = {
  uidCheck: userIdCheck,
  findUserById: findUserById,

  attachWallet: attachWallet,
  generateWallet: generateWallet,
  findWalletForUser: findWalletForUser,
  findWalletForProvider: findWalletForProvider,
  loadRealBalanceForWallet: loadRealBalanceForWallet,
  doPayment: doPayment
};