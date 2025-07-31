
// Setup Modules
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const GameInstance = require('../game/game');
const Redis = require('ioredis')

class ServerInstance {
    constructor(port = process.env.PORT || 3001) {

        // Params
        this.port = port;
        this.server = http.createServer();
        this.wss = new WebSocket.Server({ server: this.server });
        
        // State
        this.activePlayers = new Map(); // client id to socket+gameid map

        // redis
        this.redis = new Redis({ host: 'redis', port: 6379 })
        this.pubsub = new Redis({ host: 'redis', port: 6379 })

        this._setupConnectionHandling();
        this._setupPubSubHandling();
    }

    _setupPubSubHandling() {

        // open
        this.pubsub.subscribe('socket-events', (err, count) => {
        if (err) {
            console.error('Redis Pub/Sub subscribe failed:', err);
        }
        });

        // receive
        this.pubsub.on('message', (channel, message) => {
        try {
            const data = JSON.parse(message);
            this._handlePubSubEvent(data);
        } catch (e) {
            console.error('Failed to parse pubsub message:', e);
        }});
    };

    _handlePubSubEvent(data) {

        // breakdown
        const { type, seeked_client, payload } = data;

        // check for entry
        const entry = this.activePlayers.get(seeked_client);
        if (!entry) {
            return;
        }

        let ws = entry.socket;
        ws.send(JSON.stringify({type, payload}));
    };

    _setupConnectionHandling() {
        this.wss.on('connection', (ws) => {

            // Announce
            console.log('Client connected');

            // Document Active conn
            const client_id = uuidv4();
            ws.client_id = client_id;
            this.activePlayers.set(client_id, {socket:ws, game_id:null}) // link between the client to its socket

            // set what happens when message received
            ws.on('message', (msg) => {
                
                // verify data when server gets a message
                let data;
                try {
                    data = JSON.parse(msg);
                } 
                catch {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
                    return;
                }
                
                // if passes validation, handle it
                this._handleMessage(ws, data);
            });

            // set what happens on close
            ws.on('close', () => {
                
                // TODO: Add exit and proper cleanup on 'crash'

                // clean trace
                this.activePlayers.delete(client_id)
                console.log('Client disconnected');
            });
        });
    };

    _handleMessage(ws, data) {
        switch (data.type) {
            
            case 'request':
                switch (data.payload.action) {

                    case 'show games':
                        this._showGames(ws);
                        break;

                    case 'new game':
                        this._newGame(ws);
                        break;

                    case 'join game':
                        this._joinGame(ws, data.payload.game_id);
                        break;

                    case 'move':
                        this._makeMove(ws, data.payload.row, data.payload.col);
                        break;
                    
                    case 'exit':
                        this._exitGame(ws);
                        break;

                    default:
                        console.log(`default action: ${data.action}`);
                        break; 
                    };
                break;
            
            default:
                console.log(`default type: ${data.type}`);
                break;
        };
    };

    // Show games
    async _showGames(ws) {
        
        // get all games from redis by keys query - TODO change to scan not keys!
        const allGameIds = await this.getAllGameIds();
        ws.send(JSON.stringify({ type: 'response', payload:{action:'existing games fetched', status:'OK', game_ids:allGameIds, provoke_request:true} }))
    };

    // Create game
    _newGame(ws) {

        // Get Game and id
        const game = new GameInstance();
        game.players = {x:null, o:null}
        const game_id = uuidv4();

        // Sync
        this.saveGame(game_id, game);
        ws.send(JSON.stringify( {type: 'response', payload:{action:'new game created', status:"OK", game_id:game_id, provoke_request:true}} ))
    };

    // Join game
    async _joinGame(ws, game_id) {
        
        // get game, update with new player and save
        const game = await this.loadGame(game_id);
        let sign = null;
        if (game.players['x'] === null) { // Set as x
            game.players['x'] = ws.client_id
            sign = 'x';
        } else if (game.players['o'] === null) { // Set as o
            game.players['o'] = ws.client_id
            sign = 'o';
        } else { // Already full!
            ws.send(JSON.stringify( {type: 'response', payload:{action:'game joined', status:'NO', provoke_request:true}} ));
            return;
        }

        // Save game, link to client and notify joined
        this.activePlayers.get(ws.client_id).game_id = game_id;
        this.saveGame(game_id, game);
        ws.send(JSON.stringify( {type: 'response', payload:{action:'game joined', status:'OK', sign:sign, provoke_request:false}} ));

        // check if game full, if it is start game
        if (game.players['x'] !== null && game.players['o'] !== null)
        {

            // get other client
            // let xsocket = this.activePlayers.get(game.players['x']).socket;
            
            let seeked_client = game.players['x'];

            // ask for xclient to move
            let boardrepr = game.board.toString();
            this._askMove(ws, seeked_client, boardrepr);
        }
    };

    _askMove(socket, seeked_client, boardrepr) {

        // iMove
        if (socket.client_id === seeked_client) {

            // ask me to move, and opponent to wait!
            socket.send(JSON.stringify( {type: 'response', payload:{action:'make move', boardrepr:boardrepr, provoke_request:true}} ));
            this.redis.publish('socket-events', JSON.stringify( {type: 'notification', seeked_client:seeked_client, payload:{content:'opponents turn!', boardrepr:boardrepr, provoke_request:false}} ))
        }
        // heMove
        else {
            
            // ask him to move, and me to wait!
            socket.send(JSON.stringify( {type: 'notification', payload:{content:'opponents turn!', boardrepr:boardrepr, provoke_request:false}} ));
            this.redis.publish('socket-events', JSON.stringify( {type: 'response', seeked_client:seeked_client, payload:{action:'make move', boardrepr:boardrepr, provoke_request:true}} ))
        }

    }

    _askWin(socket, seeked_client) {
        socket.send(JSON.stringify( {type: 'response', payload:{action: 'winner', message:'you won!', provoke_request:true}} ));
        this.redis.publish('socket-events', JSON.stringify( {type: 'response', seeked_client:seeked_client, payload:{action: 'loser', message:'you lost!', provoke_request:true}} ));
    }

    async _exitGame(socket) {
        
        // get game
        const game_id = this.activePlayers.get(socket.client_id).game_id;
        const game = await this.loadGame(game_id)

        // get seeked cliend
        let seeked_client;
        if (game.currentPlayer === 'x') {seeked_client = game.players['o']} else {seeked_client = game.players['x']};

        // Announce to clients
        socket.send(JSON.stringify( {type: 'response', payload:{action: 'leaver', message:'left game!', provoke_request:true}} ));
        this.redis.publish('socket-events', JSON.stringify( {type: 'response', seeked_client:seeked_client, payload:{action: 'winner', message:'opponent left, you won!', provoke_request:true}} ))
        this.redis.del(`game:${game_id}`);
    }

    async _makeMove(socket, row, col) {
        
        // get game
        const game_id = this.activePlayers.get(socket.client_id).game_id;
        const game = await this.loadGame(game_id)
                
        // Check for within bounds
        if (row < 0 || row > 2 || col < 0 || col > 2) {
            socket.send(JSON.stringify( {type: 'notification', payload:{content:'Illegal move - cell out of bounds!', provoke_request:false}} ));
            socket.send(JSON.stringify( {type: 'response', payload:{action:'make move', provoke_request:true}} ));
            return;
        };

        
        // Make the actual move after checking if its valid
        if (game.makeMove(row, col) === false) {
            socket.send(JSON.stringify( {type: 'notification', payload:{content:'Illegal move - cell already occupied!', provoke_request:false}} ));
            socket.send(JSON.stringify( {type: 'response', payload:{action:'make move', provoke_request:true}} ));
            return;
        }

        // save
        await this.saveGame(game_id, game);

        // check if winner or still playing
        if (game.players[game.winner] === socket.client_id) {
            
            // get losers client id
            let seeked_client;
            if (game.currentPlayer === 'x') {seeked_client = game.players['o']} else {seeked_client = game.players['x']}
            
            // Ask win and remove game
            this._askWin(socket, seeked_client);
            this.redis.del(`game:${game_id}`);
        }
        else {

            // didnt win - get antisocket and keep playing
            let seeked_client = game.players[game.currentPlayer];
            this._askMove(socket, seeked_client, game.board.toString());
        }

    }

    // get all game ids that are in redis
    async getAllGameIds() {
        const keys = await this.redis.keys('game:*');
        return keys.map(key => key.split(':')[1]); // extract only the gameId part
    };

    // save game on redis server
    async saveGame(game_id, game) {
        await this.redis.set(`game:${game_id}`, JSON.stringify({game:game.toJSON(), players:{x:game.players['x'], o:game.players['o']}}) )
    };

    // load game
    async loadGame(gameId) {
        
        // Get payload and handle
        const raw = await this.redis.get(`game:${gameId}`);
        const payload = JSON.parse(raw);
        const game =  GameInstance.fromJSON(payload.game);
        game.players = payload.players;

        return game;
    };

    start() {
      this.server.listen(this.port, () => {
        console.log(`Server listening on port ${this.port}`);
      });
    };
};

// start server
server = new ServerInstance()
server.start()