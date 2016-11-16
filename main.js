/* globals remoteStorage: false, UUID: false, PouchDB: false, React: false, ReactDOM: false */
(function () {
  'use strict';

  function getTransactions () {
    const baseClient = remoteStorage.scope('/gruppenkasse/transactions/');

    return baseClient.getListing('/').then((listing) => {
      const transactionIds = Object.keys(listing);

      return Promise.all(transactionIds.map((transactionId) => baseClient.getObject(transactionId)));
    });
  }

  function listTabs (transactions) {
    return transactions.reduce((tabs, transaction) => {
      const tab = transaction.box;

      return tabs.includes(tab) ? tabs : tabs.concat(tab);
    }, []);
  }

  function transformTransaction (transaction) {
    const date = new Date(transaction.date).toJSON();

    const payingParticipants = transaction.payments;
    const joinedParticipants = (
      transaction.participants
      .filter((participantName) => payingParticipants.find((participant) => participant.participant === participantName) === undefined)
      .map((participantName) => {
        return {
          participant: participantName,
          amount: 0
        };
      })
    );
    const participants = payingParticipants.concat(joinedParticipants);

    return {
      _id: new UUID(4).format(),
      date,
      timestamp: date,
      description: transaction.title,
      participants,
      transactionType: 'SHARED',
      type: 'transaction'
    };
  }

  function transformTransactions (transactions) {
    return transactions.map(transformTransaction);
  }

  function generateDatabaseId () {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 7; ++i) {
      result += chars.substr(Math.floor(Math.random() * chars.length), 1);
    }
    return result;
  }

  function pushToDatabase (tabName, transactions) {
    const docs = transactions.concat({
      _id: 'info',
      name: tabName,
      type: 'info'
    });

    const dbName = generateDatabaseId();
    const db = new PouchDB('http://grouptabs-app.xmartin.de:5984/' + encodeURIComponent('tab/' + dbName));

    return (
      db.bulkDocs(docs)
      .then(() => dbName)
    );
  }

  const defaultState = {
    transactions: [],
    tabs: [],
    connected: false,
    loading: false,
    migrationMap: {}
  };

  const el = React.createElement;

  const AppContainer = React.createClass({

    getInitialState () {
      return defaultState;
    },

    componentDidMount () {
      remoteStorage.access.claim('gruppenkasse', 'r');
      remoteStorage.displayWidget();

      remoteStorage.on('connected', () => {
        this.setState({
          connected: true,
          loading: true
        });

        getTransactions()
        .then((transactions) => {
          this.setState({
            loading: false,
            transactions,
            tabs: listTabs(transactions)
          });
        })
        .catch(console.error.bind(console));
      });

      remoteStorage.on('disconnected', () => {
        this.setState(defaultState);
      });
    },

    onMigrateButtonClick (tab) {
      this.setState({
        migrationMap: Object.assign({}, this.state.migrationMap, {
          [tab]: 'LOADING'
        })
      });

      const transactions = transformTransactions(this.state.transactions.filter((transaction) => transaction.box === tab));

      pushToDatabase(tab, transactions)
      .then((id) => {
        this.setState({
          migrationMap: Object.assign({}, this.state.migrationMap, {
            [tab]: id
          })
        });
      })
      .catch(console.error.bind(console));
    },

    render () {
      if (this.state.connected) {
        return React.createElement(App, Object.assign({}, this.state, {onMigrateButtonClick: this.onMigrateButtonClick}));
      }

      return null;
    }
  });

  const App = (props) => {
    if (props.loading) {
      return el('p', null, 'fetching transactions from your remote storage…');
    }

    return (
      el('div', null,
        el('p', null, 'Found the following tabs in your remote storage. By clicking "migrate" your data will be migrated to a new tab on the new alpha version.'),
        el('ul', null,
          props.tabs.map((tab) => {
            return el(TabRow, {key: tab, tab, onButtonClick: props.onMigrateButtonClick, status: props.migrationMap[tab]});
          })
        )
      )
    );
  };

  const TabRow = (props) => {
    return (
      el('li', null,
        props.tab,
        ' ',
        props.status === 'LOADING'
        ? '...'
        : props.status
          ? el('code', null, props.status)
          : el('button', {onClick: props.onButtonClick.bind(null, props.tab)}, 'migrate')
      )
    );
  };

  ReactDOM.render(el(AppContainer), document.getElementById('main'));

})();
