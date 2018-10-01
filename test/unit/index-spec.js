'use strict';

const _chai = require('chai');
_chai.use(require('sinon-chai'));
_chai.use(require('chai-as-promised'));
const expect = _chai.expect;
const _rewire = require('rewire');

let _index = null;

describe('_index', function() {
    beforeEach(() => {
        _index = _rewire('../../src/index');
    });

    it('should implement methods required by the interface', function() {
        //TODO: Tests need cleanup.
        expect(_index).to.be.an('object');
    });
});
