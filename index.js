var Hapi = require('hapi');

var PORT = process.env['PORT'] || 8000;
var BASE_URI = process.env['BASE_URI'] || "http://localhost:" + PORT;

var server = new Hapi.Server('localhost', PORT, {cors: true});

var NEXT_AVAILABLE_ID = 1;

// In-memory "database"
var BOOKS = [
  new Book('Dune', 'Frank Herbert'),
  new Book('Neuromancer', 'William Gibson'),
  new Book('Snow Crash', 'Neal Stephenson'),
  new Book('Accelerando', 'Charles Stross'),
  new Book('Blindsight', 'Peter Watts'),
  new Book('Pattern Recognition', 'William Gibson'),
  new Book('Down And Out In The Magic Kingdom', 'Cory Doctorow')
];

function Book(title, author) {
    this.id = NEXT_AVAILABLE_ID++;
    this.title = title;
    this.author = author;
}


function fullUri(path) {
  return BASE_URI + path;
}


function entity(data, uri) {
    return new Entity(uri, data);
}

function collection(data, offset, total, uri) {
    return new Entity(uri, data, undefined, offset, data.length, total);
}

function link(rel, href) {
    return new Link(rel, href);
}

// FIXME: split Entity and CollectionEntity
function Entity(uri, data, links, offset, length, total) {
    this.uri = uri;
    this.offset = offset;
    this.length = length;
    this.total  = total;
    this.data = data;
    this.links = links;
}

Entity.prototype.addLink = function(rel, href) {
    return new Entity(this.uri, this.data, (this.links || []).concat(link(rel, href)), this.offset, this.offset, this.length);
};

function Link(rel, href) {
    this.rel = rel;
    this.href = href;
}

function replyEntity(reply, entity) {
    return reply(entity).header('Content-Type', 'application/vnd.argo+json');
}

function asBookEntity(book) {
    return entity(book, fullUri('/books/' + book.id));
}

server.route({
    method: 'GET',
    path: '/',
    handler: function (request, reply) {
        var root = entity({
          title: "Demo API for argo"
        }).
              addLink('books', fullUri('/books')).
              addLink('authors', fullUri('/authors'));

        replyEntity(reply, root);
    }
});

server.route({
    method: 'GET',
    path: '/books',
    handler: function (request, reply) {
        var offset = Number(request.query.offset) || 0;
        var length = Number(request.query.length) || 5;

        var booksSlice = BOOKS.slice(offset, offset+length);

        var coll = collection(booksSlice.map(asBookEntity), offset, BOOKS.length).
              addLink('root', fullUri('/'));

        if (offset > 0) {
            // FIXME: not negative!
            coll = coll.addLink('prev', fullUri('/books?offset=' + (offset-length) + '&length=' + length));
        }
        if (BOOKS.length > offset + length) {
            coll = coll.addLink('next', fullUri('/books?offset=' + (offset+length) + '&length=' + length));
        }

        replyEntity(reply, coll);
    }
});

server.route({
    method: 'POST',
    path: '/books',
    handler: function (request, reply) {
        var title = request.payload.title;
        var author = request.payload.author;
        // FIXME: error if missing

        var book = new Book(title, author);
        BOOKS.push(book);

        replyEntity(reply, asBookEntity(book));
    }
});

server.route({
    method: 'GET',
    path: '/books/{id}',
    handler: function (request, reply) {
        var id = Number(request.params.id);
        var book = BOOKS.filter(function(b){ return b.id === id; })[0];
        if (book) {
            var bookEntity = asBookEntity(book).addLink('root', fullUri('/'));

            replyEntity(reply, bookEntity);
        } else {
            replyEntity(reply, {errorKey: 'not-found'}).code(404);
        }
    }
});

server.route({
    method: 'PUT',
    path: '/books/{id}',
    handler: function (request, reply) {
        var id = Number(request.params.id);
        var bookRef = BOOKS.filter(function(b){ return b.id === id; })[0];
        if (bookRef) {
            var title = request.payload.title;
            var author = request.payload.author;
            // FIXME: error if missing

            bookRef.title = title;
            bookRef.author = author;
            reply().code(204);
        } else {
            replyEntity(reply, {errorKey: 'not-found'}).code(404);
        }
    }
});

server.route({
    method: 'DELETE',
    path: '/books/{id}',
    handler: function (request, reply) {
        var id = Number(request.params.id);
        var bookRef = BOOKS.filter(function(b){ return b.id === id; })[0];
        if (bookRef) {
            BOOKS = BOOKS.filter(function(b){ return b.id !== id; });

            reply().code(204);
        } else {
            replyEntity(reply, {errorKey: 'not-found'}).code(404);
        }
    }
});

server.route({
    method: 'GET',
    path: '/authors',
    handler: function (request, reply) {
      // FIXME?
      var authors = collection(BOOKS.map(function(book){ return book.author; }).sort());
      replyEntity(reply, authors);
    }
});


server.start();
