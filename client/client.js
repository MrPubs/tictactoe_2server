
// Setup Modules
const WebSocket = require('ws');
const readlineSync = require('readline-sync');
const { v4: uuidv4 } = require('uuid');

class ClientInstance {

    constructor(port = process.argv[2]) {
      
        // Setup Connection
        this.serverUrl = `ws://localhost:${port}`;
        this.ws = new WebSocket(this.serverUrl);

        // Setup callbacks
        this._setupWebSocketCallbacks();
    }


    _setupWebSocketCallbacks() {
        this.ws.on('open', () => this._handleOpen());
        this.ws.on('close', () => this._handleClose());
        this.ws.on('error', (err) => this._handleError(err));
        this.ws.on('message', (msg) => this._handleMessage(msg));
    }

    _handleOpen() {

        // Announce
        console.log('Connected to server');

        // Start interaction loop
        this._sendMessage(['show games', 'new game', 'join game'])
    }

    _handleClose() {
        console.log('Connection closed');
    }

    _handleError(err) {
        console.error('Connection error:', err.message);
    }

    _handleMessage(msg) {

        // Receive Comms From Server
        const data = JSON.parse(msg);

        // handle
        let options;
        switch (data.type) {

            case 'response':
                switch (data.payload.action) {
                    
                    // fetched existing games list
                    case 'existing games fetched':
                        console.log(`Existing games: ${data.payload.game_ids}`);
                        options = ['show games', 'new game', 'join game'];
                        break;
                    
                    // created new game
                    case 'new game created':
                        console.log(`New game created: ${data.payload.game_id}`);
                        options = ['show games', 'new game', 'join game'];
                        break;

                    // joined game
                    case 'game joined':

                        // Test if succesfully joined
                        switch (data.payload.status) {
                            
                            case 'OK':
                                console.log(`Succesfully joined game as ${data.payload.sign}!`);
                                break;

                            case 'NO':
                                console.log(`Failed to join game - game Full!`);
                                options = ['show games', 'new game', 'join game'];
                                break;
                        };
                        break;
                    
                    // move requested
                    case 'make move':
                        if (data.payload.boardrepr) {
                            console.log(data.payload.boardrepr);
                        } 
                        options = ['move', 'exit'];
                        break;
                    
                    // you won
                    case 'winner':
                        console.log(data.payload.message);
                        options = data.payload.options;
                        options = ['show games', 'new game', 'join game'];
                        break;

                    // you left
                    case 'leaver':
                        console.log(data.payload.message);
                        options = data.payload.options;
                        options = ['show games', 'new game', 'join game'];
                        break;

                    // you lost
                    case 'loser':
                        console.log(data.payload.message);
                        options = data.payload.options;
                        options = ['show games', 'new game', 'join game'];
                        break;

                    default:
                        console.log(`default: ${data.payload.action}`)

                };
                break;

            case 'notification':
                console.log(data.payload.boardrepr);
                console.log(data.payload.content);
                break;

            default:
                console.log(`default: ${data.type}`)
                break;
            };
        
        // if expects a request provoke it
        if (data.payload.provoke_request) {this._sendMessage(options)};
    };

    _sendMessage(options) {

        // Send Comms To Server
        let option_validated = false;
        let action;
        while (!option_validated) {
            
            action = readlineSync.question(`Choose action [${options}]: `);
            if (options.includes(action)) {option_validated = true} else {console.log('Invalid choice!')};
        };
        switch (action) {
            
            // Ask for all existing game ids
            case 'show games':
                this.ws.send(JSON.stringify( {type: 'request', payload:{action:'show games'}} ))
                break;
            
            // Ask for server to create new game
            case 'new game':
                this.ws.send(JSON.stringify( {type: 'request', payload:{action:'new game'}} ))
                break;
        
            // Ask server to join game by game id
            case 'join game':

                const game_id = readlineSync.question(`Game ID to Join to: `);
                this.ws.send(JSON.stringify( {type: 'request', payload:{action:'join game', game_id:game_id}} ));
                break;
            
            case 'move':
                const row = readlineSync.question(`Row: `)
                const col = readlineSync.question(`col: `)
                this.ws.send(JSON.stringify( {type: 'request', payload:{action:'move', row:row, col:col}} ));
                break;
            
            case 'exit':
                this.ws.send(JSON.stringify( {type: 'request', payload:{action:'exit'}} ))
                break;

            default:
                this.ws.send(JSON.stringify( {type: 'default', payload:'default'} ))
        };
    };
};

client_instance = new ClientInstance();
