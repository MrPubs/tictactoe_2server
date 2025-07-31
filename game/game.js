
class GameInstance {
    /**
     * Game instance object, represent a game instance and controls the board and game rules
     */

    constructor() {
        this.board = new Board();
        this.currentPlayer = 'x';
        this.winner = null;
        this.gameLock = false;
    };

    // Restart game
    restartGame() {
        this.constructor()
    }

    // Test for move validity
    isValidMove(row, col) {
        
        // check for row and col within limits
        if (row >= 0 && row <= 2 && col >= 0 && col <= 2) {
            
            // Check for lock
            if (this.gameLock !== true) {

                // check for empty vell
                const valid_move = (this.board.board_repr[row][col] === '');
                if (valid_move === true) {

                    // Empty
                    console.log(`Move ${row},${col} is valid!`);
                    return true;
                }
                else {

                    // Occupied
                    console.log(`Move ${row},${col} is NOT valid!`);
                    return false;
                };
            }
            else {

                // Locked!
                console.log('Board is locked, wait for board update to take place!');
                return false;
            };
        }
        else {
            console.log('cell index not within game board!')
            return false;
        };
    };

    // Check for win condition
    checkWin() {
        
        // board and player to serve to conditions
        const b = this.board.board_repr;
        const p = this.currentPlayer;

        // check for rows and columns
        for (let i=0; i<3; i++) {
            if (b[i][0] === p && b[i][1] === p && b[i][2] === p) return true;
            if (b[0][i] === p && b[1][i] === p && b[2][i] === p ) return true;
        };

        // Check diagonals
        if (b[0][0] === p && b[1][1] === p && b[2][2] === p) return true;
        if (b[0][2] === p && b[1][1] === p && b[2][0] === p) return true;
        
        // Not Solved!!
        return false;
    };

    // switch current player
    switchPlayer() {

        if (this.currentPlayer === 'x') {this.currentPlayer = 'o'}
        else {this.currentPlayer = 'x'};
        console.log(`Its now Player ${this.currentPlayer}'s turn!`);
    };

    // make a move
    makeMove(row, col) {

        // Move if move is valid, else reject
        if (this.isValidMove(row, col)) {
            
            // Lock Game
            this.gameLock = true;
            console.log(`Locking board for making ${this.currentPlayer} Player's move!`);

            // make move
            this.board.setCell(this.currentPlayer, row, col)
        
            // check for win condition - set winner if true
            if (this.checkWin()) {
                
                this.winner = this.currentPlayer
                console.log(`Player ${this.winner} is the Winner!`)
            }
            else {

                // Switch Player
                this.switchPlayer()

                // Release Game Lock
                this.gameLock = false
                console.log('\n')
            };
            
            return true;
        }
        else {return false}; 
    };

    toJSON() {
        return {
            board_repr: this.board.board_repr,
            currentPlayer: this.currentPlayer,
            winner: this.winner,
            gameLock: this.gameLock,
        };
    };

    static fromJSON(data) {
        const instance = new GameInstance();
        instance.board.board_repr = data.board_repr;
        instance.currentPlayer = data.currentPlayer;
        instance.winner = data.winner;
        instance.gameLock = data.gameLock;
        return instance;
    };

};

class Board {
    /**
     * Board class, all board manipulation and handling happens here, controlled by gameInstance
     */
    constructor() {
        
        // initialize board
        this.board_repr = this.initializeBoard();
    };

    // Initialize board
    initializeBoard() {
        return([
            ['','',''],
            ['','',''],
            ['','','']
        ]);
    };

    // Set cell at row and col index to specified cell
    setCell(sign,row,col) {

        // Set and show
        this.board_repr[row][col] = sign;
        console.log(this.toString());
    };

    // Visual repr of the board for printing
    toString() {
        return this.board_repr.map((row, i) => {
            const line = row.map(cell => cell || ' ').join(' | ');
            return i < 2 ? line + '\n' + '---+---+---' : line;
        }).join('\n');
    }
}

module.exports = GameInstance;