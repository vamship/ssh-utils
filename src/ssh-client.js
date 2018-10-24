'use strict';

const { argValidator: _argValidator } = require('@vamship/arg-utils');
const _ssh2 = require('ssh2');
const Promise = require('bluebird');
const RemoteClient = require('./remote-client');

/**
 * Result of execution from a single command.
 *
 * @typedef {Object} ExecutionResult
 * @property {String} command The command string that was executed, including
 *           all arguments/options.
 * @property {Boolean} success A boolean parameter that indicates whether or
 *           not the command was executed successfully.
 * @property {Number} exitCode The exit code from the command
 * @property {String} stdout The contents of the STDOUT from command execution
 * @property {String} stderr The contents of the STDERR from command execution
 */
/**
 * SSH command execution results. Returns a summary of the commands and an array
 * containing detailed command results.
 *
 * @typedef {Object} SshExecutionResults
 * @property {Number} commandCount The number of commands requested
 * @property {Number} successCount The number of successful command executions
 * @property {Number} errorCount The number of command executions that had
 *           errors
 * @property {ExecutionResult[]} results Execution results from each individual
 *           command executed.
 */
/**
 * Abstract base class for SSH based clients (ssh, scp). Provides methods for
 * connection configuration and setup.
 */
class SshClient extends RemoteClient {
    /**
     * @param {ClientConfig} options Connection configuration for the client
     */
    constructor(options) {
        super(options);
    }

    /**
     * Executes a set of commands sequentially, and returns the results of
     * command execution. Command set execution will only continue after each
     * command in the set has completed successfully. Execution will be aborted
     * if a failure is encountered.
     *
     * Command execution will be treated as a failure if the `exec()` method
     * on the ssh client fails, or if the command exits with a non zero error
     * code.
     *
     * @private
     * @param {Object} client A reference to the ssh client to use to execute
     *        the commands. It is assumed that the client has successfully
     *        established a connection to the remote host.
     * @param {String[]} commands An array of strings representing the commands
     *        to be executed on the remote host.
     *
     * @return {Promise<ExecutionResults[]>} An array of execution results for
     *         each command that was executed. If commands are not executed due
     *         to a failure in an earlier command, no execution result will be
     *         provided for that command.
     *         Note that this method always resolves its promise even if a
     *         command execution fails.
     */
    _runCommandSet(client, commands) {
        const results = [];
        let _finishMethod = undefined;

        client.on('continue', () => {
            this.logger.trace('Continuing command execution');
            if (_finishMethod) {
                _finishMethod();
            }
        });

        return Promise.mapSeries(commands, (command) => {
            return new Promise((resolve, reject) => {
                _finishMethod = undefined;
                this.logger.trace('Executing command', { command });
                const callNext = client.exec(command, (err, stream) => {
                    const result = {
                        command,
                        success: true,
                        stdout: '',
                        stderr: ''
                    };
                    results.push(result);

                    if (err) {
                        this.logger.trace(err, 'Error executing command');
                        result.success = false;
                        result.error = err;
                        reject(err);
                        return;
                    }
                    stream
                        .on('close', (code, signal) => {
                            result.exitCode = code;
                            if (code !== 0) {
                                const err = new Error(
                                    'Program exited with non zero exit code'
                                );
                                result.error = err;
                                result.success = false;
                                reject(err);
                            } else if (callNext) {
                                this.logger.trace(
                                    'Command execution successful. Invoking next'
                                );
                                resolve(result);
                            } else {
                                this.logger.trace(
                                    'Command execution successful, but client not ready. Waiting'
                                );
                                _finishMethod = () => {
                                    resolve(result);

                                    // Resolution complete. Do no further processing.
                                    _finishMethod = undefined;
                                };
                            }
                        })
                        .on('data', (data) => {
                            result.stdout += data;
                        })
                        .stderr.on('data', (data) => {
                            result.stderr += data;
                        });
                });
            });
        })
            .then(() => {
                this.logger.trace('Command set executed successfully');
                return results;
            })
            .catch((err) => {
                this.logger.error(err, 'Error running command set');
                return results;
            });
    }

    /**
     * Connects to the remote host, and executes the specified command(s) on it
     * sequentially. Execution will be aborted if any of the commands fail.
     *
     * @param {String|Array} commands The commands to execute on the remote host.
     *
     * @return {Promise<SshExecutionResults>} A promise that will be resolved
     *         with an object that defines the results of execution of the
     *         commands. Note that the promise will be resolved even if command
     *         execution fails. Promise rejection implies a general failure,
     *         such as connection errors, etc.
     */
    run(commands) {
        if (_argValidator.checkString(commands, 1)) {
            commands = [commands];
        }
        _argValidator.checkArray(commands, 'Invalid command(s) (arg #1)');

        const execResult = {
            commandCount: commands.length,
            successCount: 0,
            failureCount: 0,
            results: []
        };
        return this.getConnectionOptions().then((connOpts) => {
            return new Promise((resolve, reject) => {
                const client = new _ssh2.Client();
                client
                    .on('ready', () => {
                        this.logger.trace('Connected to remote host', {
                            host: this._host,
                            username: this._username
                        });

                        this._runCommandSet(client, commands)
                            .then((results) => {
                                results.forEach((result) => {
                                    if (result.success) {
                                        execResult.successCount++;
                                    } else {
                                        execResult.failureCount++;
                                    }
                                });
                                execResult.results = results;
                                resolve(execResult);
                            })
                            .finally((execResult) => {
                                resolve(execResult);
                                client.end();
                            });
                    })
                    .on('error', (err) => {
                        this.logger.error(
                            err,
                            'Fatal error executing commands on remote host'
                        );
                        client.end();
                        reject(err);
                    })
                    .connect(connOpts);
            });
        });
    }
}

module.exports = SshClient;
