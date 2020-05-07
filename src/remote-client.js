'use strict';

const _fs = require('fs');
const { argValidator: _argValidator } = require('@vamship/arg-utils');
const { ArgError } = require('@vamship/error-types').args;
const _loggerProvider = require('@vamship/logger');
const Promise = require('bluebird');

/**
 * Options object passed to the entity, containing references to a logger
 * object.
 *
 * @typedef {Object} ClientConfig
 * @property {String} host The ipaddress/hostname of the remote host to connect
 *           to.
 * @property {Number} [port=22] The port number on which to connect to the
 *           remote client.
 * @property {String} username The username to use when authenticating to the
 *           remote host.
 * @property {String} password The password to use when authenticating to the
 *           remote host. If a private key is also specified, the password will
 *           be used to unlock the ssh key. If the ssh key is specifed, and does
 *           not have a passphrase, this parameter should be omitted.
 * @property {String} privateKey A private key to use to authenticate to the
 *           remote host. If the private key requires a passphrase, the value in
 *           the password field will be used as the passphrase.
 * @property {Object} [logger] logger object that can be used write log
 *           messages. If omitted, a new log object will be created using
 *           the getLogger() method from the {@link external:Logger} module.
 */
/**
 * Abstract base class for SSH based clients (ssh, scp). Provides methods for
 * connection configuration and setup.
 */
class RemoteClient {
    /**
     * @param {ClientConfig} options Connection configuration for the client
     */
    constructor(options) {
        _argValidator.checkObject(
            options,
            'Invalid client configuration (arg #1)'
        );
        _argValidator.checkString(
            options.host,
            1,
            'Invalid host (options.host)'
        );
        _argValidator.checkString(
            options.username,
            1,
            'Invalid username (options.username)'
        );

        const connectionData = Object.assign({}, options);

        if (!_argValidator.checkNumber(options.port, 1)) {
            connectionData.port = 22;
        }
        if (!_argValidator.checkString(connectionData.privateKey, 1)) {
            connectionData.privateKey = undefined;
        }
        if (!_argValidator.checkString(connectionData.password, 1)) {
            connectionData.password = undefined;
        }
        if (
            connectionData.privateKey === undefined &&
            connectionData.password === undefined
        ) {
            throw new ArgError(
                'Invalid password (options.password) or private key (options.privateKey). Must provide at least one.'
            );
        }
        this._logger = _loggerProvider.getLogger(
            `@vamship/ssh-utils:${this.constructor.name}`
        );
        this._host = connectionData.host;
        this._port = connectionData.port;
        this._username = connectionData.username;
        this._password = connectionData.password;
        this._privateKey = connectionData.privateKey;
        this._privateKeyData = undefined;
    }

    /**
     * Returns a reference to the logger object for the component.
     *
     * @protected
     * @return {Object} A reference to the logger object.
     */
    get logger() {
        return this._logger;
    }

    /**
     * Initializes and returns a connection object that can be used to connect
     * to the remote host. If necessary, this method will load the private key
     * from the file system
     *
     * @protected
     * @return {Promise} An object containing connection parameters for the
     *         remote host.
     */
    getConnectionOptions(client, command) {
        this.logger.trace('Configuring connection options');
        const connectionOptions = {
            host: this._host,
            port: this._port,
            username: this._username,
        };
        return Promise.try(() => {
            if (!this._privateKey) {
                this.logger.info('Using password authentication');
                connectionOptions.password = this._password;
            } else {
                this.logger.info('Using private key authentication');

                return new Promise((resolve, reject) => {
                    if (this._privateKeyData) {
                        this.logger.trace(
                            'Private key exists in cache. Skipping load from file system'
                        );
                        resolve(this._privateKeyData);
                    } else {
                        this.logger.trace(
                            'Loading private key data from file system'
                        );
                        _fs.readFile(this._privateKey, (err, data) => {
                            if (err) {
                                this.logger.error(
                                    err,
                                    'Error loading private key'
                                );
                                reject(err);
                            }
                            this._privateKeyData = data;
                            resolve(data);
                        });
                    }
                }).then((data) => {
                    connectionOptions.passphrase = this._password;
                    connectionOptions.privateKey = data;
                });
            }
        }).then(() => {
            return connectionOptions;
        });
    }
}

module.exports = RemoteClient;
