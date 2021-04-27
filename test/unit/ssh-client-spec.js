'use strict';

const _chai = require('chai');
_chai.use(require('sinon-chai'));
_chai.use(require('chai-as-promised'));
const expect = _chai.expect;

const _rewire = require('rewire');
const Promise = require('bluebird');

const {
    testValues: _testValues,
    asyncHelper: _asyncHelper,
    SuperSpyBuilder,
    ObjectMock,
} = require('@vamship/test-utils');

const { ArgError } = require('@vamship/error-types').args;
const RemoteClient = require('../../src/remote-client');
const SshClient = _rewire('../../src/ssh-client');

describe('SshClient', () => {
    function _buildOptions(options) {
        options = options || {
            host: _testValues.getString('host'),
            port: _testValues.getNumber(1024, 22),
            username: _testValues.getString('username'),
            password: _testValues.getString('password'),
        };
        return options;
    }

    function _createSshClient(options) {
        options = options || {
            host: _testValues.getString('host'),
            port: _testValues.getNumber(1024, 22),
            username: _testValues.getString('username'),
            password: _testValues.getString('password'),
        };
        return new SshClient(options);
    }

    let _superSpy = null;
    let _sshClientMock = null;
    let _streamMock = null;

    beforeEach(() => {
        _superSpy = new SuperSpyBuilder(RemoteClient, SshClient);
        _superSpy.inject();

        const stderr = new ObjectMock().addMock('on', (event, callback) => {
            return addHandler('stderr', callback);
        });
        _streamMock = new ObjectMock().addMock('on', (event, callback) => {
            return addHandler(event, callback);
        });
        _streamMock.instance.stderr = stderr.instance;

        _streamMock.__handlers = {};

        function addHandler(event, callback) {
            let handlerList = _streamMock.__handlers[event];
            if (!handlerList) {
                handlerList = [];
                _streamMock.__handlers[event] = handlerList;
            }
            handlerList.push(callback);
            return _streamMock.instance;
        }

        _sshClientMock = new ObjectMock()
            .addMock('on', (event, callback) => {
                _sshClientMock.__handlers[event] = callback;
                return _sshClientMock.instance;
            })
            .addMock('connect')
            .addMock('exec', () => _sshClientMock.__execResult)
            .addMock('continue')
            .addMock('end');
        _sshClientMock.__handlers = {};
        _sshClientMock.__execResult = true;

        SshClient.__set__('_ssh2', {
            Client: _sshClientMock.ctor,
        });
    });

    afterEach(() => {
        _superSpy.restore();
    });

    describe('ctor()', () => {
        it('should invoke the super constructor with correct parameters', () => {
            const superMethod = _superSpy.mocks.super;

            expect(superMethod.stub).to.not.have.been.called;
            const options = _buildOptions();
            const client = _createSshClient(options);

            expect(client).to.be.an.instanceOf(RemoteClient);
            expect(superMethod.stub).to.have.been.calledOnce;
            expect(superMethod.stub).to.have.been.calledWithExactly(options);
        });

        it('should return an object with the expected methods and properties', () => {
            const client = _createSshClient();

            expect(client).to.be.an('object');
            expect(client.run).to.be.a('function');
        });
    });

    describe('run()', () => {
        it('should throw an error if invoked without valid command(s)', () => {
            const message = 'Invalid command(s) (arg #1)';
            const inputs = _testValues.allButSelected('string', 'array');

            inputs.forEach((command) => {
                const wrapper = () => {
                    const client = _createSshClient();
                    return client.run(command);
                };

                expect(wrapper).to.throw(ArgError, message);
            });
        });

        it('should return a promise when invoked', () => {
            const client = _createSshClient();
            const ret = client.run([_testValues.getString('command')]);

            expect(ret).to.be.an('object');
            expect(ret.then).to.be.a('function');
        });

        it('should create a new ssh client', () => {
            const client = _createSshClient();
            const sshCtor = _sshClientMock.ctor;

            expect(sshCtor).to.not.have.been.called;

            client.run([_testValues.getString('command')]);

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    expect(sshCtor).to.have.been.calledOnce;
                    expect(sshCtor).to.be.calledWithExactly();
                });
        });

        it('should setup minimal event handlers on the client', () => {
            const client = _createSshClient();

            expect(_sshClientMock.__handlers.ready).to.be.undefined;
            expect(_sshClientMock.__handlers.error).to.be.undefined;

            client.run([_testValues.getString('command')]);

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    expect(_sshClientMock.__handlers.ready).to.be.a('function');
                    expect(_sshClientMock.__handlers.error).to.be.a('function');
                });
        });

        it('should attempt to make a connection using the correct connection options', () => {
            const client = _createSshClient();
            const connectMethod = _sshClientMock.mocks.connect;

            expect(connectMethod.stub).to.not.have.been.called;

            client.run([_testValues.getString('command')]);

            return _asyncHelper
                .wait(10)()
                .then(() => {
                    return client.getConnectionOptions();
                })
                .then((connOpts) => {
                    expect(connectMethod.stub).to.have.been.calledOnce;
                    expect(connectMethod.stub.args[0][0]).to.deep.equal(
                        connOpts
                    );
                });
        });

        it('should reject the promise if the connection does not succeed', () => {
            const client = _createSshClient();
            const connectMethod = _sshClientMock.mocks.connect;
            const error = 'something went wrong!';

            expect(connectMethod.stub).to.not.have.been.called;

            const response = client.run([_testValues.getString('command')]);

            _asyncHelper
                .wait(10)()
                .then(() => {
                    const errorHandler = _sshClientMock.__handlers.error;
                    errorHandler(error);
                });

            return expect(response).to.be.rejectedWith(error);
        });

        it('should execute the commands on the remote host if connection succeeds', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = [_testValues.getString('command')];

            expect(execMethod.stub).to.not.have.been.called;

            client.run(commands);
            return _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(_asyncHelper.wait(10))
                .then(() => {
                    const callback = execMethod.stub.args[0][1];
                    callback(null, _streamMock.instance);
                })
                .then(() => {
                    expect(execMethod.stub).to.have.been.called;
                    expect(execMethod.stub.callCount).to.equal(commands.length);
                });
        });

        it('should execute commands without pause if the client allows it', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];

            expect(_sshClientMock.__handlers.continue).to.be.undefined;
            expect(execMethod.stub).to.not.have.been.called;

            client.run(commands);
            return _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    expect(_sshClientMock.__handlers.continue).to.be.a(
                        'function'
                    );
                    return Promise.mapSeries(commands, (command, index) => {
                        const callback = execMethod.stub.args[index][1];
                        callback(null, _streamMock.instance);
                        _streamMock.__handlers.close[index](0);
                        return _asyncHelper.wait(1)();
                    });
                })
                .then(() => {
                    expect(execMethod.stub).to.have.been.called;
                    expect(execMethod.stub.callCount).to.equal(commands.length);
                });
        });

        it('should ignore unsolicited continue events from the client', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];

            expect(_sshClientMock.__handlers.continue).to.be.undefined;
            expect(execMethod.stub).to.not.have.been.called;

            client.run(commands);
            return _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    expect(_sshClientMock.__handlers.continue).to.be.a(
                        'function'
                    );
                    return Promise.mapSeries(commands, (command, index) => {
                        const callback = execMethod.stub.args[index][1];
                        callback(null, _streamMock.instance);
                        _streamMock.__handlers.close[index](0);

                        // Unsolicited continue.
                        _sshClientMock.__handlers.continue();

                        return _asyncHelper.wait(1)();
                    });
                })
                .then(() => {
                    expect(execMethod.stub).to.have.been.called;
                    expect(execMethod.stub.callCount).to.equal(commands.length);
                });
        });

        it('should pause for the continue event if the client requests a pause', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];

            // Client asks for wait before continuing
            _sshClientMock.__execResult = false;

            expect(_sshClientMock.__handlers.continue).to.be.undefined;
            expect(execMethod.stub).to.not.have.been.called;

            client.run(commands);
            return _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    expect(_sshClientMock.__handlers.continue).to.be.a(
                        'function'
                    );
                    return Promise.mapSeries(commands, (command, index) => {
                        expect(execMethod.stub).to.have.been.called;
                        expect(execMethod.stub.callCount).to.equal(index + 1);
                        const callback = execMethod.stub.args[index][1];
                        callback(null, _streamMock.instance);
                        _streamMock.__handlers.close[index](0);

                        _sshClientMock.__handlers.continue();

                        return _asyncHelper.wait(1)();
                    });
                });
        });

        it.only('should accept a string command instead of an array', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = _testValues.getString('command');

            expect(execMethod.stub).to.not.have.been.called;

            client.run(commands);
            return _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(_asyncHelper.wait(10))
                .then(() => {
                    expect(execMethod.stub).to.have.been.calledOnce;
                    expect(execMethod.stub.args[0][0]).to.equal(commands);
                    const callback = execMethod.stub.args[0][1];
                    callback(null, _streamMock.instance);
                    _streamMock.__handlers.close[0](0);

                    return _asyncHelper.wait(1)();
                });
        });

        it('should resolve the promise after all commands have been executed successfully', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const endMethod = _sshClientMock.mocks.end;
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];

            expect(endMethod.stub).to.not.have.been.calledOnce;

            const response = client.run(commands);
            _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    return Promise.mapSeries(commands, (command, index) => {
                        const callback = execMethod.stub.args[index][1];
                        callback(null, _streamMock.instance);
                        _streamMock.__handlers.close[index](0);

                        return _asyncHelper.wait(1)();
                    });
                });
            return expect(response).to.be.fulfilled.then((result) => {
                expect(endMethod.stub).to.have.been.calledOnce;
                expect(endMethod.stub).to.have.been.calledWithExactly();
                expect(result).to.be.an('object');
                expect(result.commandCount).to.equal(commands.length);
                expect(result.successCount).to.equal(commands.length);
                expect(result.failureCount).to.equal(0);
                expect(result.results)
                    .to.be.an('array')
                    .and.to.have.length(commands.length);
            });
        });

        it('should abort command execution after the first command fails', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const endMethod = _sshClientMock.mocks.end;
            const error = 'something went wrong';
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];
            const successCount = _testValues.getNumber(commands.length - 1);
            expect(endMethod.stub).to.not.have.been.calledOnce;

            const response = client.run(commands);
            _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    return Promise.mapSeries(commands, (command, index) => {
                        if (index <= successCount) {
                            const callback = execMethod.stub.args[index][1];
                            if (index === successCount) {
                                callback(error);
                            } else {
                                callback(null, _streamMock.instance);
                                _streamMock.__handlers.close[index](0);
                            }
                        }
                        return _asyncHelper.wait(1)();
                    });
                });
            return expect(response).to.be.fulfilled.then((result) => {
                expect(endMethod.stub).to.have.been.calledOnce;
                expect(endMethod.stub).to.have.been.calledWithExactly();

                expect(result).to.be.an('object');
                expect(result.commandCount).to.equal(commands.length);
                expect(result.successCount).to.equal(successCount);
                expect(result.failureCount).to.equal(1);
                expect(result.results)
                    .to.be.an('array')
                    .and.to.have.length(successCount + 1);
            });
        });

        it('should treat a non zero exit code as a failure for a command', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];
            const successCount = _testValues.getNumber(commands.length - 1);
            const exitCode = _testValues.getNumber(-10, -1);

            const response = client.run(commands);
            _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    return Promise.mapSeries(commands, (command, index) => {
                        if (index <= successCount) {
                            const callback = execMethod.stub.args[index][1];
                            callback(null, _streamMock.instance);
                            if (index === successCount) {
                                _streamMock.__handlers.close[index](exitCode);
                            } else {
                                _streamMock.__handlers.close[index](0);
                            }
                        }
                        return _asyncHelper.wait(1)();
                    });
                });
            return expect(response).to.be.fulfilled.then((result) => {
                expect(result).to.be.an('object');
                expect(result.commandCount).to.equal(commands.length);
                expect(result.successCount).to.equal(successCount);
                expect(result.failureCount).to.equal(1);
                expect(result.results)
                    .to.be.an('array')
                    .and.to.have.length(successCount + 1);
                result.results.forEach((result, index) => {
                    if (index === successCount) {
                        expect(result.success).to.be.false;
                        expect(result.exitCode).to.equal(exitCode);
                    } else {
                        expect(result.success).to.be.true;
                        expect(result.exitCode).to.equal(0);
                    }
                });
            });
        });

        it('should include the output from stderr and stdout for each command', () => {
            const client = _createSshClient();
            const execMethod = _sshClientMock.mocks.exec;
            const commands = [
                _testValues.getString('command'),
                _testValues.getString('command'),
                _testValues.getString('command'),
            ];
            const stdoutResponses = [
                _testValues.getString('stdout'),
                _testValues.getString('stdout'),
                _testValues.getString('stdout'),
            ];
            const stderrResponses = [
                _testValues.getString('stderr'),
                _testValues.getString('stderr'),
                _testValues.getString('stderr'),
            ];

            const response = client.run(commands);
            _asyncHelper
                .wait(10)()
                .then(() => {
                    const readyHandler = _sshClientMock.__handlers.ready;
                    readyHandler();
                })
                .then(() => {
                    return Promise.mapSeries(commands, (command, index) => {
                        const callback = execMethod.stub.args[index][1];
                        callback(null, _streamMock.instance);
                        _streamMock.__handlers.data[index](
                            stdoutResponses[index]
                        );
                        _streamMock.__handlers.stderr[index](
                            stderrResponses[index]
                        );
                        _streamMock.__handlers.close[index](0);
                        return _asyncHelper.wait(1)();
                    });
                });
            return expect(response).to.be.fulfilled.then((result) => {
                result.results.forEach((result, index) => {
                    expect(result.command).to.equal(commands[index]);
                    expect(result.exitCode).to.equal(0);
                    expect(result.success).to.be.true;
                    expect(result.stdout).to.equal(stdoutResponses[index]);
                    expect(result.stderr).to.equal(stderrResponses[index]);
                });
            });
        });
    });
});
