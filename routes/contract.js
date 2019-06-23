var express = require('express');
var router = express.Router();
const common = require('./common');
const kaoruConfig = require('../config');
const StellarSdk = require('stellar-sdk');
const server = new StellarSdk.Server(kaoruConfig.stellar);
const async = require('async');

const {UserProvider, UserTransaction, Provider, Wallet, RewardLog} = require('../model');

StellarSdk.Network.useTestNetwork();

router.post('/', common.uidCheck, common.attachWallet, (req, res, next) => {
  let bd = req.body;
  //user id for funder, reciever
  // weight, 
  /* 
  weightage for each, 
    0, both gets 1 vote
    1, reciever get 1 vote, funder get 0
    -1, funder get 1 vote, reciever gets 0
  */
  const { funder, reciever, amount, memo } = bd;
  const start = typeof bd.start != 'undefined' ? bd.start : -1;
  const end = typeof bd.end != 'undefined' ? bd.end : -1;

  let minAmount = amount;// need .5 in balance else funder account gets invalid in future, plus signature requirements
  
  async.parallel({
    funder: (callback) => {
      common.findWalletForUser(funder, callback);
    },
    reciever: (callback) => {
      common.findWalletForProvider(reciever, callback);
    },
    provider: (callback) => {
      Provider.findByPk(reciever).then(rs => {
        const dv = rs.dataValues;
        const info = JSON.parse(dv.info);
        return callback(null, info);
      }).catch(err => {
        console.log(err);
        return callback(err);
      });
    }
  }, (err, all) => {
    if(err || !all.funder || !all.reciever) {
      console.log('error in finding wallets');
      console.log(err);
      res.status(500);
      return res.end();
    }

    const funderWallet = all.funder;
    common.loadRealBalanceForWallet(funderWallet.public, (err, fWalletResult) => {
      if(err || !fWalletResult) {
        console.log('Something went wrong with reading balance from funder account');
        console.log(err);
        res.status(500);
        return res.end();
      }
      
      const theProvider = all.provider;

      if(start != -1) {
        const stations = all.provider.stations;
        let stAmount = stations[0].cost;
        for(let i = 0; i < stations.length;i++) {
          if(stations[i].index == start) {
            stAmount = stations[i].cost;
            break;
          }
        }
        minAmount = stations[stations.length - 1].cost - stAmount;
        console.log('minAmount ', minAmount);

        const fbalance = parseFloat(fWalletResult.balance);
        if(fbalance < minAmount) {
          res.status(418);// teapot
          return res.jsonp({success: false, message:'Balance too low'});
        }
        proceedFromUserProvider(req, res, next, all, minAmount);
      } else if(end != -1) { // find pending transaction first
        UserProvider.findOne({where: {user: funder, contractor: reciever}}).then(upr => {
          let uprr = upr.dataValues;
          let upWalletId = uprr.wallet;
          let currentTransactionsCount = uprr.payments_count;

          async.parallel( {
            utrans: (callba) => {
              UserTransaction.findAll({where: {wallet: upWalletId}, order: [['id','DESC']], limit: 1}).then(ptrans => {
                if(ptrans.length) {
                  let ptransaction = ptrans[0].dataValues;
                  if(ptransaction.status == 'processing') {
                    return callba(null, ptransaction);
                  } 
                } 
                return callba(true, null);
              }).catch(err => {
                return callba(err);
              });
            },
            utwallet: (callba) => {
              Wallet.findOne({where: {user: upWalletId}}).then(wone => {
                return callba(null, wone.dataValues);
              }).catch(err => {
                return callba(err);
              })
            }
          }, (uerr, uresults) => {
            if(uerr) {
              console.log(uerr);
              res.status(500);
              return res.end();
            }

            let startedFrom = uresults.utrans.from;

            const stations = all.provider.stations;
            let stAmount = stations[startedFrom].cost;

            let endIndex = end < 0 ? 0 : end;
            endIndex  = endIndex > (stations.length - 1) ? (stations.length - 1) : endIndex;
            let memoText = '';
            let costToUser = 0;
            if(endIndex > startedFrom) {
              let endCost = stations[endIndex].cost;
              let lastCost = stations[stations.length - 1].cost;
              let ct = endCost - stAmount;
              costToUser = ct;
              let st = lastCost - stAmount;
              minAmount = st - ct;
            } else {
              // TODO handle reverse
              minAmount = minAmount < 0 ? (-1 * minAmount) : minAmount;
            }

            const fbalance = parseFloat(fWalletResult.balance);
            if(fbalance < minAmount) {
              res.status(418);// teapot
              return res.jsonp({success: false, message:'Balance too low'});
            }

            memoText = 'Payment done';
            const uwallet = uresults.utwallet;
            let mo = minAmount.toFixed(5);
            common.doPayment(uwallet, all.funder, mo, memoText, (perr, presult) => {
              if(perr) {
                console.log(perr);
                res.status(500);
                return res.end();
              }
              console.log('after payment');
              UserTransaction.create({wallet: uwallet.user, by: funder, status: 'done', from: endIndex, amount: mo})
              .then(utcreate => {
                console.log('transaction happened');
                currentTransactionsCount++;
                // update transactions counter
                let utcc = utcreate.dataValues;
                RewardLog.create({user: funder, transaction: utcc.id, amount: theProvider.green_per_trip}).then(() => {
                  console.log('reward logged for user');
                }).catch(err => {
                  console.log('unable to reward logs');
                  console.log(err);
                });

                upr.update({payments_count: currentTransactionsCount}).then(() => {
                  console.log('payments count updated');
                }).catch(err => {
                  console.log(err);
                  console.log('unable to update payments count');
                })
                
                return res.jsonp({success: true, data: {amount: costToUser.toFixed(4)}});
              })
              .catch(uterr => {
                console.log(uterr);
                res.status(500);
                return res.end();
              });
            });

          });

        })
        .catch(err => {
          console.log(err);
          res.status(500);
          return res.end();
        });
      }
    });
  });
});


const proceedFromUserProvider = (req, res, next, all, minAmount) => {
  const bd = req.body;
  const { funder, reciever, memo } = req.body;
  const start = typeof bd.start != -1 ? bd.start : -1;
  const memoText = memo ? memo : 'Payment ';
  let mo = minAmount.toFixed(5);
  UserProvider.findAll({where: {user: funder, contractor: reciever}})
      .then((ups) => {
        if(ups.length == 0) {
          // wallet generated, transaction done, just say cheese :)
          
          fundNewWallet(funder, reciever, (err, urWallet) => {
            if(err) {
              res.status(500);
              return res.end();
            }
            common.doPayment(all.funder,  urWallet, mo, memoText, (err, presult) => {
              if(err) {
                res.status(500);
                return res.end();
              }
              UserTransaction.create({wallet: urWallet.public, by: funder, amount: mo, from: start }).then(utResult => {
                return res.jsonp({success: true});  
              }).catch(err => {
                console.log(err);
                res.status(500);
                return res.end();
              })
            });
          });
        } else {
          const wlaet = ups[0];
          const prWalletId = wlaet.wallet;
          common.doPayment(all.funder, all.reciever,  mo, memoText, (err, presult) => {
            if(err) {
              res.status(500);
              return res.end();
            }
            UserTransaction.create({wallet: prWalletId, by: funder, amount: mo, from: start }).then(utResult => {
              return res.jsonp({success: true});  
            }).catch(err => {
              console.log(err);
              res.status(500);
              return res.end();
            })
          });
        }
      })
      .catch(err=> {
        console.log('err');
        console.log(err);
        res.status(500);
        return res.end();
      });
}

const fundNewWallet = (funderId, recieverId, callback) => {
  const kind = 'provider-vault';
  const destination = StellarSdk.Keypair.random();
  const kaoruSource = StellarSdk.Keypair.fromSecret(kaoruConfig.my.secret);
  const memo = StellarSdk.Memo.text('Provider Wallet init');

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
        startingBalance: '1.00000' // min funding, enough for few hundred transaction fees
      }))
      .setTimeout(300)
      .build()
    transaction.sign(StellarSdk.Keypair.fromSecret(kaoruSource.secret()))
    return server.submitTransaction(transaction)
  })
  .then(results => {
    return UserProvider.create({user: funderId, contractor: recieverId, wallet: destination.publicKey()});
  })
  .then( upResult => {
    let upRes = upResult.dataValues;
    return upRes.wallet;
  })
  .then( upId => {
    return Wallet.create({user: upId, secret: destination.secret(), public: destination.publicKey(), balance: '1.00000', kind: kind});
  })
  .then((walletResult) => {
    const wr = walletResult.dataValues;
    return callback(null, wr);
  })
  .catch(err => {
    console.log('got eror', err);
    return callback(err, null);
  });
}


/*
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
    console.log('#---- ', err);
    // console.log(err);
    return callback(err, null);
  });
};*/



module.exports = router;