
// Setup Modules
const WebSocket = require('ws');
const readlineSync = require('readline-sync');
const { v4: uuidv4 } = require('uuid');

class ClientInstance {

    constructor(port = process.argv[2]) {
      
        // Setup Connection
        this.serverUrl = `ws://localhost:${port}`;
        this.ws = new WebSocket(this.serverUrl);
        this.client_id = null;
        this.options = ['show games', 'new game', 'join game']

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
    }

    _handleClose() {
        this.ws.send()
        console.log('Connection closed');
    }

    _handleError(err) {
        console.error('Connection error:', err.message);
    }

    _handleMessage(msg) {

        // Receive Comms From Server
        const data = JSON.parse(msg);
        switch (data.type) {
            
            // Notify whats the client id
            case 'client_id':
                this.client_id = data.id;
                break;
            
            case 'winner':
                console.log("You won!");
                this.options = data.options;
                break;

            case 'existing_games':
                console.log(`Existing Games: ${data.message}`);
                break;

            case 'game_created':
                const createdGame = data.message;
                break;
            
            case 'joined_game':
                console.log(data.boardrepr)
                this.options = data.options
                break;
            
            case 'left_game':
                this.options = data.options
                break;

            case 'error':
                console.log(data.message)
                break;
            
            case 'your_turn':
                console.log(data.boardrepr)
                break;

            default:
                console.log("idk..");
                break;
        };

        // Send Comms To Server
        const action = readlineSync.question(`Choose action [${this.options}]: `)
        switch (action) {
            
            case 'show games':
                this.ws.send(JSON.stringify({ type: action }));
                break;

            case 'new game':
                this.ws.send(JSON.stringify({ type: action, payload: {client_id: this.client_id}}));
                break;

            case 'join game':
                const game_id = readlineSync.question(`Choose game id: `)
                this.ws.send(JSON.stringify({ type: action, payload: {client_id: this.client_id, game_id: game_id}}));
                break;

            case 'move':
                const row = readlineSync.question(`Choose row: `);
                const col = readlineSync.question(`Choose col: `);

                this.ws.send(JSON.stringify({type: action, payload:{client_id:this.client_id, row:row, col:col}}))
                break;

            case 'exit':
                this.ws.send(JSON.stringify({ type: action, payload: {client_id: this.client_id}}))
                break;

                
        };
    };
};

client_instance = new ClientInstance();
