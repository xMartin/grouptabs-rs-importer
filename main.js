/* globals remoteStorage: false, UUID: false, PouchDB: false, React: false, ReactDOM: false */
'use strict';
{
  const getTransactions = () => {
    const baseClient = remoteStorage.scope('/gruppenkasse/transactions/');

    return baseClient.getListing('/').then((listing) => {
      const transactionIds = Object.keys(listing);

      return Promise.all(transactionIds.map((transactionId) => baseClient.getObject(transactionId)));
    });
  };

  const listTabs = (transactions) => {
    return transactions.reduce((tabs, transaction) => {
      const tab = transaction.box;

      return tabs.includes(tab) ? tabs : tabs.concat(tab);
    }, []);
  };

  const transformTransaction = (transaction) => {
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
  };

  const transformTransactions = (transactions) => {
    return transactions.map(transformTransaction);
  };

  const generateDatabaseId = () => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 7; ++i) {
      result += chars.substr(Math.floor(Math.random() * chars.length), 1);
    }
    return result;
  };

  const pushToDatabase = (tabName, transactions) => {
    const docs = transactions.concat({
      _id: 'info',
      name: tabName,
      type: 'info'
    });

    const dbName = generateDatabaseId();
    const db = new PouchDB('https://grouptabs-app.xmartin.de:5984/' + encodeURIComponent('tab/' + dbName));

    return (
      db.bulkDocs(docs)
      .then(() => dbName)
    );
  };

  const initialState = {
    transactions: [],
    tabs: [],
    connected: false,
    loading: false,
    migrationMap: {}
  };

  const el = React.createElement;

  const AppContainer = React.createClass({

    getInitialState () {
      return initialState;
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
        this.setState(initialState);
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
      return React.createElement(App, Object.assign({}, this.state, {onMigrateButtonClick: this.onMigrateButtonClick}));
    }
  });

  const App = (props) => {
    if (!props.connected) {
      return (
        el('div', null,
          el('p', null,
            'Copy tabs from your ',
            el('a', {href: 'https://remotestorage.io'}, 'Remote Storage'),
            ' to the new ',
            el('a', {href: 'https://app.grouptabs.net'}, 'app.grouptabs.net'),
            '.'
          ),
          el('p', null, 'Start by connecting the remote storage.')
        )
      );
    }

    if (props.loading) {
      return el('p', null, 'fetching transactions from your remote storage…');
    }

    return (
      el('div', null,
        el('p', null, 'Found the following tabs in your Remote Storage:'),
        el(TabList, props),
        el('p', null, 'Clicking "migrate" will copy your data to a new tab on ',
          el('a', {href: 'https://app.grouptabs.net'}, 'app.grouptabs.net'),
          '. Enter the "new ID" in the "open existing tab" form in the app to display the tab.'
        )
      )
    );
  };

  const TabList = (props) => {
    return (
      el('table', null,
        el('tbody', null,
          props.tabs.map((tab) => {
            return el(TabRow, {key: tab, tab, onButtonClick: props.onMigrateButtonClick, status: props.migrationMap[tab]});
          })
        )
      )
    );
  };

  const TabRow = (props) => {
    return (
      el('tr', null,
        el('th', null, props.tab),
        props.status === 'LOADING'
        ? el('td', null, 'copying...')
        : props.status
          ? el('td', null,
              'new ID: ',
              el('code', null, props.status)
            )
          : el('td', null,
              el('button', {onClick: props.onButtonClick.bind(null, props.tab)}, 'migrate')
            )
      )
    );
  };

  ReactDOM.render(el(AppContainer), document.getElementById('main'));
}
