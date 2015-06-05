'use strict';

var util = require('util'),
    path = require('path'),
	  fs = require('fs'),
    yeoman = require('yeoman-generator'),
    jsYaml = require('js-yaml'),
    apischema = require('swaggerize-routes/lib/schema/swagger-spec/schemas/v2.0/schema.json'),
    builderUtils = require('swaggerize-routes/lib/utils'),
    wreck = require('wreck'),
    enjoi = require('enjoi'),
    update = require('./update');

var ModuleGenerator = yeoman.generators.Base.extend({
    initialize: function () {
        this.pkg = yeoman.file.readJSON(path.join(__dirname, '../package.json'));

    		this.on('end', function () {
                if (!this.options['skip-install'] && this.only.length === 0) {
                    this.npmInstall();
                }
        });
    },

    askFor: function () {
        var self, done, pkg;

        self = this;
        done = this.async();
        this.only = this.options.only;
        this.framework = this.options.framework;
        this.apiPath = this.options.apiPath && path.resolve(this.options.apiPath);
        this.appname = path.basename(process.cwd());

        if (!this.only || this.only === true) {
            this.only = [];
        }
        else {
            this.only = this.only.split(',');
        }

        if (this.only.length > 0) {
            if (fs.existsSync(path.resolve('package.json'))) {
                pkg = yeoman.file.readJSON(path.resolve('package.json'));
                if (pkg.dependencies.hapi) {
                    this.framework = 'hapi';
                }
            }
        }

        function all() {
            return self.only.length === 0;
        }

        console.log('Swaggerize Generator');
        var prompts = [
            {
                name: 'appname',
                message: 'What would you like to call this project:',
                default : this.appname,
                when: all
            },
            {
                name: 'creatorName',
                message: 'Your name:',
                when: all
            },
            {
                name: 'githubUser',
                message: 'Your github user name:',
                when: all
            },
            {
                name: 'email',
                message: 'Your email:',
                when: all
            },
            {
                name: 'apiPath',
                message: 'Path (or URL) to swagger document:',
                required: true,
                default: this.apiPath
            },
            {
                name: 'database',
                message: 'The database name to use with mongoose:',
                default: this.framework || 'db',
            }
        ];

        this.prompt(prompts, function (props) {
            var self;

            self = this;

            this.appname = props.appname || this.appname;
            this.creatorName = props.creatorName;
            this.githubUser = props.githubUser;
            this.email = props.email;
            this.framework = 'express';
            this.database = props.database;
            this.appRoot = path.basename(process.cwd()) === this.appname ? this.destinationRoot() : path.join(this.destinationRoot(), this.appname);


            if (this.framework !== 'express') {
                done(new Error('Unrecognized framework: ' + this.framework));
                return;
            }

            if (props.apiPath.indexOf('http') === 0) {
                wreck.get(props.apiPath, function (err, res, body) {
                    var fp = props.apiPath.split('/');

                    if (err) {
                        done(err);
                        return;
                    }
                    if (res.statusCode !== 200) {
                        done(new Error('404: ' + props.apiPath));
                        return;
                    }
                    self.rawApi = body;
                    self.apiPath = path.join(self.appRoot, 'config/' + fp[fp.length - 1]);
                    self.api = loadApi(self.apiPath, body);
                    done();
                });
            }
            else {
                this.apiPath = path.resolve(props.apiPath);
                this.api = loadApi(this.apiPath);
                done();
            }
        }.bind(this));
    },

    root: function () {
        if (process.cwd() !== this.appRoot) {
            this.mkdir(this.appRoot);
            process.chdir(this.appRoot);
        }
    },

    validate: function () {
        var done = this.async();

        this.api = this.api || yeoman.file.readJSON(this.apiPath);

        enjoi(apischema).validate(this.api, function (error) {
            done(error);
        });
    },

    app: function () {
        if (this.only.length === 0) {
            this.mkdir('config');
            this.mkdir('lib');

            this.copy('jshintrc', '.jshintrc');
            this.copy('gitignore', '.gitignore');
            this.copy('npmignore', '.npmignore');

            this.template('server_' + this.framework + '.js', 'server.js', {
                apiPath: path.relative(this.appRoot, path.join(this.appRoot, 'config', path.basename(this.apiPath))).replace(/\\/g,"/")
            });
            this.template('_README.md', 'README.md');
			      this.template('_package.json', 'package.json');
            this.template('lib_mongoose.js', 'lib/lib_mongoose.js');
            this.template('databaseConfig.js', 'config/databaseConfig.js');
        }

        //File
        if (fs.existsSync(this.apiPath)) {
            this.copy(this.apiPath, 'config/' + path.basename(this.apiPath));
        }
        //Url
        else {
            if (!fs.existsSync(this.apiPath)) {
                this.write(this.apiPath, this.rawApi);
            }
        }
    },

    handlers: function () {
        var routes, self;

        if (this.only.length > 0 && !~this.only.indexOf('handlers')) {
            return;
        }

        self = this;
        routes = {};

        this.mkdir('handlers');

        Object.keys(this.api.paths).forEach(function (path) {
            var pathnames, route;

            route = {
                path: path,
                pathname: undefined,
                methods: []
            };

            pathnames = [];

            path.split('/').forEach(function (element) {
                if (element) {
                    pathnames.push(element);
                }
            });

            route.pathname = pathnames.join('/');

            builderUtils.verbs.forEach(function (verb) {
                var operation = self.api.paths[path][verb];

                if (!operation) {
                    return;
                }

                route.methods.push({
                    method: verb,
                    name: operation.operationId || '',
                    description: operation.description || '',
                    parameters: operation.parameters || [],
                    produces: operation.produces || []
                });
            });

            if (routes[route.pathname]) {
                routes[route.pathname].methods.push.apply(routes[route.pathname].methods, route.methods);
                return;
            }

            routes[route.pathname] = route;
        });

        Object.keys(routes).forEach(function (routePath) {
            var pathnames, route, file;

            route = routes[routePath];
            pathnames = route.pathname.split('/');

            file = path.join(self.appRoot, 'handlers' , pathnames.join('/') + '.js').replace(/\\/g,"/");

            if (fs.existsSync(file)) {
                fs.writeFileSync(file, update.handlers(file, self.framework, route));
                return;
            }

            self.template('_handler_' + self.framework + '.js', file, route);
        });
    },

    models: function () {
        var self = this;

        if (this.only.length > 0 && !~this.only.indexOf('models')) {
            return;
        }

        this.mkdir('models');

        Object.keys(this.api.definitions || {}).forEach(function (modelName) {
            var fileName, model;

            fileName = modelName.toLowerCase() + '.js';

            model = self.api.definitions[modelName];

            if (!model.id) {
                model.id = modelName;
            }
      			if (model["x-mongoose"]) {
              model.definitions = self.api.definitions;
      				self.template('_model_mongoose.js', path.join(self.appRoot, 'models', fileName).replace(/\\/g,"/"), model);
      			}
            else {
              self.template('_model.js', path.join(self.appRoot, 'models', fileName).replace(/\\/g,"/"), model);
            }
        });
    }
});

function loadApi(apiPath, content) {
    if (apiPath.indexOf('.yaml') === apiPath.length - 5 || apiPath.indexOf('.yml') === apiPath.length - 4) {
        return jsYaml.load(content || fs.readFileSync(apiPath));
    }
    return content ? JSON.parse(content) : yeoman.file.readJSON(apiPath);
}

module.exports = ModuleGenerator;
