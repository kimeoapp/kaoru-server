const Sequelize = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './kaoru.db'
});

// qr code for smart contracts
// const QR = sequelize.define('qr', {
  
// }, {});

const Provider = sequelize.define('provider', {
  name: { type: Sequelize.STRING, allowNull: false },
  info: { type: Sequelize.STRING, allowNull: true },
  provider_id: {type: Sequelize.NUMBER}
}, {});

const User = sequelize.define('user', {
  name: { type: Sequelize.STRING, allowNull: false},
  info: {type: Sequelize.STRING, allowNull: true}
}, {});

const Wallet = sequelize.define('wallet', {
  // attributes
  user: {
    type: Sequelize.NUMBER
  },
  secret: {
    type: Sequelize.STRING,
    allowNull: false
  },
  public: {
    type: Sequelize.STRING,
    allowNull: false
  },
  balance: {
    type: Sequelize.STRING,
    allowNull: false
  },
  kind: {
    type: Sequelize.STRING,
    defaultValue: 'end'
  }
}, {});

const UserProvider = sequelize.define('user_provider', {
  wallet: { type: Sequelize.STRING, primaryKey: true},
  user: { type: Sequelize.NUMBER, primaryKey: true },
  contractor: { type: Sequelize.NUMBER, primaryKey: true},
  payments_count: {type: Sequelize.NUMBER, defaultValue: 0}
}, {});

const UserTransaction = sequelize.define('user_transaction', {
  wallet: { type: Sequelize.STRING },
  by: {type: Sequelize.NUMBER },
  from: {type: Sequelize.NUMBER, defaultValue: 0},
  amount: { type: Sequelize.STRING, defaultValue: '0'},
  status: { type: Sequelize.STRING, defaultValue: 'processing'}
}, {});

const RewardLog = sequelize.define('reward_log', {
  transaction: {type: Sequelize.STRING},
  amount: {type: Sequelize.STRING, defaultValue: '0'},
  user: {type: Sequelize.NUMBER}
},{})

/*
UserTransaction.sync({force: true}).then(()=> {
  console.log('User Transaction synced with db');
});
User.sync({force: false}).then(() => {
  console.log('User synced with db');
});

Wallet.sync({ force: false }).then(() => {
  console.log("Wallet synced with db");
});

UserProvider.sync({force: false}).then(() => {
  console.log('User Contract synced');
});

Provider.sync({force: false}).then(() => {
  console.log('Providers synced');
});*/

module.exports = { 
  db: sequelize, 
  Wallet: Wallet, 
  User: User, 
  UserProvider: UserProvider, 
  UserTransaction: UserTransaction,
  RewardLog: RewardLog,
  Provider: Provider };