var StellarSdk = require('stellar-sdk');
var fs = require('fs');
const path = require('path');
const pair = StellarSdk.Keypair.random();
const fetch = require('node-fetch');
const stellarUrl = "https://horizon-testnet.stellar.org";
const {db, User, Provider} = require('./model');
const async = require('async');

let pairs = {};
pairs['secret'] = pair.secret();
pairs['public'] = pair.publicKey();

let configData = {
  stellar: stellarUrl,
  my: pairs
};

const server = new StellarSdk.Server(stellarUrl);

async function generateConfig() {
  let contents = fs.readFileSync('./config.js');
  if(contents && contents.public) {
    pairs = {secret: contents.secret, public: contents.public};
    return false;
  }
  let toWrite = 'module.exports = ' + JSON.stringify(configData, 2) + ';';
  fs.writeFileSync('./config.js', toWrite);
  return true;
}


async function populateMain() {
  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(pair.publicKey())}`
    );
    const responseJSON = await response.json();
    console.log("SUCCESS! You have a new account :)\n");
    return true;
  } catch (e) {
    console.error("ERROR!", e);
    return false;
  }
}


async function populateProviders() {
  let basePath = path.join(__dirname, 'service-providers');

  fs.readdir(basePath, (err, results) => {
    if(err) {
      console.log('error in reading service providers');
      console.log(err);
      return;
    }
    let providers = [];
    for(let i = 0; i < results.length; i ++) {
      let all = require( path.join(basePath, results[i]));
      for(let j = 0; j < all.length; j++) {
        const single = all[j];
        if(single && single['provider_id']) {
          providers.push(single);
        }
      }
    }

    const common = require('./routes/common');

    async.eachSeries(providers, (item, callback) => {
      Provider.create({name: item.name, provider_id: item.provider_id, info: JSON.stringify(item)}).then(provider => {
        let pro = provider.dataValues;
        common.generateWallet(pro.id, '5.0000', 'provider', callback);
      }).catch(err => {
        callback(err);
      });
    }, (err, results) => {
      return results;
    });

   });
}

//the JS SDK uses promises for most actions, such as retrieving an account
async function loadAccountInfo() {
  const account = await server.loadAccount(pair.publicKey());
  console.log("Balances for account: " + pair.publicKey());
  account.balances.forEach(function(balance) {
    console.log("Type:", balance.asset_type, ", Balance:", balance.balance);
  });
}

// populateMain().then(loadAccountInfo);

db.sync({force: true})
  .then(() => {
    console.log('genrating config');
    return generateConfig()
  })
  .then( updated => {
    console.log('in populate main ', updated);
    if(updated) {
      return populateMain();
    }
    return;
  })
  .then(() => {
    console.log('ppuate providers');
    populateProviders();
  });