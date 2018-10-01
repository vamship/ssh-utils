'use strict';

const _chai = require('chai');
_chai.use(require('sinon-chai'));
_chai.use(require('chai-as-promised'));
const expect = _chai.expect;

const _rewire = require('rewire');

const { testValues: _testValues, ObjectMock } = require('@vamship/test-utils');
const { ArgError } = require('@vamship/error-types').args;

const RemoteClient = _rewire('../../src/remote-client');
const Promise = require('bluebird');
const LOG_METHODS = [
    'silent',
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'child'
];

describe('RemoteClient', () => {
    function _createRemoteClient(options) {
        options = options || {
            host: _testValues.getString('host'),
            port: _testValues.getNumber(22, 100),
            username: _testValues.getString('username'),
            password: _testValues.getString('password')
        };

        return new RemoteClient(options);
    }

    let _fsMock = null;

    beforeEach(() => {
        _fsMock = new ObjectMock().addMock('readFile');

        RemoteClient.__set__('_fs', _fsMock.instance);
    });

    describe('ctor()', () => {
        it('should throw an error if invoked without a valid client options', () => {
            const message = 'Invalid client configuration (arg #1)';
            const inputs = _testValues.allButObject();

            inputs.forEach((options) => {
                const wrapper = () => {
                    return new RemoteClient(options);
                };

                expect(wrapper).to.throw(ArgError, message);
            });
        });

        it('should throw an error if the options does not define a valid host', () => {
            const message = 'Invalid host (options.host)';
            const inputs = _testValues.allButString('');

            inputs.forEach((host) => {
                const wrapper = () => {
                    const options = {
                        host
                    };
                    return new RemoteClient(options);
                };

                expect(wrapper).to.throw(ArgError, message);
            });
        });

        it('should throw an error if the options does not define a valid username', () => {
            const message = 'Invalid username (options.username)';
            const inputs = _testValues.allButString('');

            inputs.forEach((username) => {
                const wrapper = () => {
                    const options = {
                        host: _testValues.getString('host'),
                        username
                    };
                    return new RemoteClient(options);
                };

                expect(wrapper).to.throw(ArgError, message);
            });
        });

        it('should throw an error if the options does not define a valid password or a private key', () => {
            const message =
                'Invalid password (options.password) or private key (options.privateKey). Must provide at least one.';
            const inputs = _testValues.allButString('');

            inputs.forEach((value) => {
                const wrapper = () => {
                    const options = {
                        host: _testValues.getString('host'),
                        username: _testValues.getString('username'),
                        password: value,
                        privateKey: value
                    };
                    return new RemoteClient(options);
                };

                expect(wrapper).to.throw(ArgError, message);
            });
        });

        it('should not throw an error if the options defines a password but not a private key', () => {
            const inputs = _testValues.allButString('');

            inputs.forEach((value) => {
                const wrapper = () => {
                    const options = {
                        host: _testValues.getString('host'),
                        username: _testValues.getString('username'),
                        password: _testValues.getString('password'),
                        privateKey: value
                    };
                    return new RemoteClient(options);
                };

                expect(wrapper).to.not.throw();
            });
        });

        it('should not throw an error if the options defines a private key but not a password', () => {
            const inputs = _testValues.allButString('');

            inputs.forEach((value) => {
                const wrapper = () => {
                    const options = {
                        host: _testValues.getString('host'),
                        username: _testValues.getString('username'),
                        password: value,
                        privateKey: _testValues.getString('privateKey')
                    };
                    return new RemoteClient(options);
                };

                expect(wrapper).to.not.throw();
            });
        });

        it('should not throw an error if the options defines both private key and password', () => {
            const wrapper = () => {
                const options = {
                    host: _testValues.getString('host'),
                    username: _testValues.getString('username'),
                    password: _testValues.getString('password'),
                    privateKey: _testValues.getString('privateKey')
                };
                return new RemoteClient(options);
            };

            expect(wrapper).to.not.throw();
        });

        it('should return an object with expected properties and methods', () => {
            const options = {
                host: _testValues.getString('host'),
                username: _testValues.getString('username'),
                password: _testValues.getString('password'),
                privateKey: _testValues.getString('privateKey')
            };
            const client = new RemoteClient(options);
            expect(client.logger).to.be.an('object');
            LOG_METHODS.forEach((method) => {
                expect(client.logger[method]).to.be.a('function');
            });
            expect(client.getConnectionOptions).to.be.an('function');
        });
    });

    describe('getConnectionOptions()', () => {
        it('should return a promise when invoked', () => {
            const client = _createRemoteClient();
            const ret = client.getConnectionOptions();

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should set the host, username and port properties using constructor values', () => {
            const options = {
                host: _testValues.getString('host'),
                port: _testValues.getNumber(1024, 22),
                username: _testValues.getString('username'),
                password: _testValues.getString('password')
            };
            const client = _createRemoteClient(options);
            const ret = client.getConnectionOptions();
            return expect(ret).to.be.fulfilled.then((conn) => {
                expect(conn.host).to.equal(options.host);
                expect(conn.username).to.equal(options.username);
                expect(conn.port).to.equal(options.port);
            });
        });

        it('should default the port to 22 if no valid port is specified', () => {
            const inputs = _testValues.allButNumber(-1, -22, -1024, 0);

            return Promise.all(
                inputs.map((port) => {
                    const options = {
                        host: _testValues.getString('host'),
                        username: _testValues.getString('username'),
                        password: _testValues.getString('password'),
                        port
                    };
                    const client = _createRemoteClient(options);
                    return client.getConnectionOptions().then((conn) => {
                        expect(conn.port).to.equal(22);
                    });
                })
            );
        });

        it('should use password authentication if a valid private key is not specified', () => {
            const inputs = _testValues.allButString('');

            return Promise.all(
                inputs.map((privateKey) => {
                    const options = {
                        host: _testValues.getString('host'),
                        username: _testValues.getString('username'),
                        password: _testValues.getString('password'),
                        privateKey
                    };
                    const readFileMethod = _fsMock.mocks.readFile;

                    readFileMethod.reset();

                    const client = _createRemoteClient(options);
                    return client.getConnectionOptions().then((conn) => {
                        expect(conn.password).to.equal(options.password);
                        expect(readFileMethod.stub).to.not.have.been.called;
                        expect(conn.privateKey).to.be.undefined;
                        expect(conn.passphrase).to.be.undefined;
                    });
                })
            );
        });

        it('should reject the promise if a private key is specified, but cannot be loaded', () => {
            const options = {
                host: _testValues.getString('host'),
                username: _testValues.getString('username'),
                privateKey: _testValues.getString('privateKey')
            };
            const error = 'something went wrong!';
            const readFileMethod = _fsMock.mocks.readFile;

            expect(readFileMethod.stub).to.not.have.been.called;

            const client = _createRemoteClient(options);
            const ret = client.getConnectionOptions();

            const callback = readFileMethod.stub.args[0][1];
            callback(error);

            return expect(ret).to.be.rejectedWith(error);
        });

        it('should configure private key data if private key load is successful', () => {
            const options = {
                host: _testValues.getString('host'),
                username: _testValues.getString('username'),
                privateKey: _testValues.getString('privateKey')
            };
            const privateKeyData = _testValues.getString('privateKeyData');
            const readFileMethod = _fsMock.mocks.readFile;

            expect(readFileMethod.stub).to.not.have.been.called;

            const client = _createRemoteClient(options);
            const ret = client.getConnectionOptions();

            expect(readFileMethod.stub).to.have.been.calledOnce;

            const callback = readFileMethod.stub.args[0][1];
            callback(null, privateKeyData);

            return expect(ret).to.be.fulfilled.then((conn) => {
                expect(conn.privateKey).to.equal(privateKeyData);
                expect(conn.password).to.be.undefined;
            });
        });

        it('should cache the private key data after the first call', () => {
            const options = {
                host: _testValues.getString('host'),
                username: _testValues.getString('username'),
                privateKey: _testValues.getString('privateKey')
            };
            const privateKeyData = _testValues.getString('privateKeyData');
            const readFileMethod = _fsMock.mocks.readFile;

            expect(readFileMethod.stub).to.not.have.been.called;

            const client = _createRemoteClient(options);

            const firstRet = client.getConnectionOptions();

            const callback = readFileMethod.stub.args[0][1];
            callback(null, privateKeyData);

            return firstRet
                .then(() => {
                    return Promise.all([
                        client.getConnectionOptions(),
                        client.getConnectionOptions(),
                        client.getConnectionOptions()
                    ]);
                })
                .then(() => {
                    return expect(firstRet).to.be.fulfilled.then((conn) => {
                        expect(readFileMethod.stub).to.have.been.calledOnce;
                        expect(conn.privateKey).to.equal(privateKeyData);
                        expect(conn.password).to.be.undefined;
                    });
                });
        });

        it('should not set passphrase if private key is specified, but password is not', () => {
            const options = {
                host: _testValues.getString('host'),
                username: _testValues.getString('username'),
                privateKey: _testValues.getString('privateKey')
            };
            const privateKeyData = _testValues.getString('privateKeyData');
            const readFileMethod = _fsMock.mocks.readFile;

            expect(readFileMethod.stub).to.not.have.been.called;

            const client = _createRemoteClient(options);
            const ret = client.getConnectionOptions();

            expect(readFileMethod.stub).to.have.been.calledOnce;

            const callback = readFileMethod.stub.args[0][1];
            callback(null, privateKeyData);

            return expect(ret).to.be.fulfilled.then((conn) => {
                expect(conn.passphrase).to.be.undefined;
                expect(conn.password).to.be.undefined;
            });
        });

        it('should set passphrase if both private key and password are specified', () => {
            const options = {
                host: _testValues.getString('host'),
                username: _testValues.getString('username'),
                privateKey: _testValues.getString('privateKey'),
                password: _testValues.getString('password')
            };
            const privateKeyData = _testValues.getString('privateKeyData');
            const readFileMethod = _fsMock.mocks.readFile;

            expect(readFileMethod.stub).to.not.have.been.called;

            const client = _createRemoteClient(options);
            const ret = client.getConnectionOptions();

            expect(readFileMethod.stub).to.have.been.calledOnce;

            const callback = readFileMethod.stub.args[0][1];
            callback(null, privateKeyData);

            return expect(ret).to.be.fulfilled.then((conn) => {
                expect(conn.passphrase).to.be.equal(options.password);
                expect(conn.password).to.be.undefined;
            });
        });
    });
});
