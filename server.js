var express = require('express');
var bodyParser = require('body-parser');

var jsog = require('jsog')
var cache = require('persistent-cache');

var games = cache({memory: false});

var app = express();


String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

function getObjectById(array, id) {
    for(var index in array) {
        if(array[index].id == id) {
            return array[index];
        }
    }
}

function toJsog(object) {
    jsog.nextId = 0;
    console.log("returning: " + jsog.stringify(object).replaceAll("@", "$"));
    return JSON.parse(jsog.stringify(object).replaceAll("@", "$"));
}

app.use(bodyParser.json({strict: false}));
app.use(function(req, res, next) {
    console.log(req.method + ": '" + req.url + "'");
    console.log(JSON.stringify(req.body));
    req.body = jsog.parse(JSON.stringify(req.body).replaceAll("$", "@"));
    next();
});

// debug output
app.use(function(req, res, next) {
    next();
});

function doAdvancementIfNeccesary(game) {
    while(shouldBeAdvanced(game)) {
        advanceGame(game)
    }
}

function shouldBeAdvanced(game) {
    if(game.game.settings.turnTimer > 0 && game.game.lastAdvancement + game.game.settings.turnTimer * 60 * 1000 > new Date().valueOf()) {
        return true;
    }
    var players = game.game.settings.numberOfPlayers;
    var i = 0;
    for(var index in game.ordersNextTurn) {
        if(index.indexOf("__") == -1) {
            i++;
        }
    }
    console.log(i + " of " + players + " players have given orders.")
    return players == i
}

function advanceGame(game) {
    console.log("advancing game " + req.params.id);
    for(var index in game.ordersNextTurn) {
        if(index.indexOf("__") == -1 ) {
            var orders = game.ordersNextTurn[index];
            orders.forEach(function (order) {
                order.owner = getObjectById(game.game.players, order.owner.id);
                game.game.orders.push(order);
            });
        }
    }
    game.ordersNextTurn = {};
    game.game.turnsPassed++;
    game.game.lastAdvancement += game.game.settings.turnTimer * 60 * 1000
    games.putSync(req.params.id, jsog.encode(game));
}


app.get("/games/:id", function(req, res) {
    games.get(req.params.id, function(err, data) {
        if(data == undefined) {
            res.status(404)
        } else {
            var game = jsog.decode(data)
            doAdvancementIfNeccesary(game)
            res.status(200).json(toJsog(game.game))
        }
    })
});


app.get("/games/:id/orders/:player", function(req, res) {
    games.get(req.params.id, function(err, data) {
        var game = jsog.decode(data);
        var orders = game.ordersNextTurn[req.params.player];
        if(orders === undefined) {
            req.status(200).json([])
        }
        req.status(200).json(toJsog(game));
    });
});

app.post("/games/:id/orders/:player", function(req, res){

    var game = jsog.decode(games.getSync(req.params.id));
    if(game == undefined) {
        console.log("could not find game with id: " + req.params.id);
        res.status(404).send();
    }

    if(shouldBeAdvanced(game)) {
        doAdvancementIfNeccesary(game);
        res.status(409).send();
    }

    if(req.body.length > game.game.settings.commandsPerTurn) {
        res.status(413).send();
    }

    game.ordersNextTurn[req.params.player] = req.body;
    games.putSync(req.params.id, jsog.encode(game));


    res.status(200).send();
});

app.post("/games/:id", function(req, res){

    games.putSync(req.params.id, jsog.encode({
        game: req.body,
        ordersNextTurn: {}
    }));

    res.status(200).send();
});


app.listen(process.env.PORT, function(a) {
    console.log("Listening")
});
