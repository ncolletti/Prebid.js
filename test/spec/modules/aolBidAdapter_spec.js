import {expect} from 'chai';
import * as utils from 'src/utils';
import {spec} from 'modules/aolBidAdapter';
import {config} from 'src/config';

const DEFAULT_AD_CONTENT = '<script>logInfo(\'ad\');</script>';

let getDefaultBidResponse = () => {
  return {
    id: '245730051428950632',
    cur: 'USD',
    seatbid: [{
      bid: [{
        id: 1,
        impid: '245730051428950632',
        price: 0.09,
        adm: DEFAULT_AD_CONTENT,
        crid: 'creative-id',
        h: 90,
        w: 728,
        dealid: 'deal-id',
        ext: {sizeid: 225}
      }]
    }]
  };
};

let getMarketplaceBidParams = () => {
  return {
    placement: 1234567,
    network: '9599.1'
  };
};

let getNexageGetBidParams = () => {
  return {
    dcn: '2c9d2b50015c5ce9db6aeeed8b9500d6',
    pos: 'header'
  };
};

let getNexagePostBidParams = () => {
  return {
    id: 'id-1',
    imp: [{
      id: 'id-2',
      banner: {
        w: '100',
        h: '100'
      },
      tagid: 'header1'
    }]
  };
};

let getDefaultBidRequest = () => {
  return {
    bidderCode: 'aol',
    auctionId: 'd3e07445-ab06-44c8-a9dd-5ef9af06d2a6',
    bidderRequestId: '7101db09af0db2',
    start: new Date().getTime(),
    bids: [{
      bidder: 'aol',
      bidId: '84ab500420319d',
      bidderRequestId: '7101db09af0db2',
      auctionId: 'd3e07445-ab06-44c8-a9dd-5ef9af06d2a6',
      placementCode: 'foo',
      params: getMarketplaceBidParams()
    }]
  };
};

let getPixels = () => {
  return '<script>document.write(\'<img src="img.org"></iframe>' +
    '<iframe src="pixels1.org"></iframe>\');</script>';
};

describe('AolAdapter', () => {
  const MARKETPLACE_URL = '//adserver-us.adtech.advertising.com/pubapi/3.0/';
  const NEXAGE_URL = '//hb.nexage.com/bidRequest?';
  const ONE_DISPLAY_TTL = 60;
  const ONE_MOBILE_TTL = 3600;

  function createCustomBidRequest({bids, params} = {}) {
    var bidderRequest = getDefaultBidRequest();
    if (bids && Array.isArray(bids)) {
      bidderRequest.bids = bids;
    }
    if (params) {
      bidderRequest.bids.forEach(bid => bid.params = params);
    }
    return bidderRequest;
  }

  describe('interpretResponse()', () => {
    let bidderSettingsBackup;
    let bidResponse;
    let bidRequest;
    let logWarnSpy;
    let formatPixelsStub;
    let isOneMobileBidderStub;

    beforeEach(() => {
      bidderSettingsBackup = $$PREBID_GLOBAL$$.bidderSettings;
      bidRequest = {
        bidderCode: 'test-bidder-code',
        bidId: 'bid-id',
        ttl: 1234
      };
      bidResponse = {
        body: getDefaultBidResponse()
      };
      logWarnSpy = sinon.spy(utils, 'logWarn');
      formatPixelsStub = sinon.stub(spec, 'formatPixels');
      isOneMobileBidderStub = sinon.stub(spec, 'isOneMobileBidder');
    });

    afterEach(() => {
      $$PREBID_GLOBAL$$.bidderSettings = bidderSettingsBackup;
      logWarnSpy.restore();
      formatPixelsStub.restore();
      isOneMobileBidderStub.restore();
    });

    it('should return formatted bid response with required properties', () => {
      let formattedBidResponse = spec.interpretResponse(bidResponse, bidRequest);
      expect(formattedBidResponse).to.deep.equal({
        bidderCode: bidRequest.bidderCode,
        requestId: 'bid-id',
        ad: DEFAULT_AD_CONTENT,
        cpm: 0.09,
        width: 728,
        height: 90,
        creativeId: 'creative-id',
        pubapiId: '245730051428950632',
        currency: 'USD',
        dealId: 'deal-id',
        netRevenue: true,
        ttl: bidRequest.ttl
      });
    });

    it('should add pixels to ad content when pixels are present in the response', () => {
      bidResponse.body.ext = {
        pixels: 'pixels-content'
      };

      formatPixelsStub.returns('pixels-content');
      let formattedBidResponse = spec.interpretResponse(bidResponse, bidRequest);

      expect(formattedBidResponse.ad).to.equal(DEFAULT_AD_CONTENT + 'pixels-content');
    });

    it('should show warning in the console', function() {
      $$PREBID_GLOBAL$$.bidderSettings = {
        aol: {
          bidCpmAdjustment: function() {}
        }
      };
      spec.interpretResponse(bidResponse, bidRequest);
      expect(utils.logWarn.calledOnce).to.be.true;
    });
  });

  describe('buildRequests()', () => {
    it('method exists and is a function', () => {
      expect(spec.buildRequests).to.exist.and.to.be.a('function');
    });

    describe('Marketplace', () => {
      it('should not return request when no bids are present', () => {
        let [request] = spec.buildRequests([]);
        expect(request).to.be.empty;
      });

      it('should return request for Marketplace endpoint', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(MARKETPLACE_URL);
      });

      it('should return request for Marketplace via onedisplay bidder code', () => {
        let bidRequest = createCustomBidRequest({
          bids: [{
            bidder: 'onedisplay'
          }],
          params: getMarketplaceBidParams()
        });

        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(MARKETPLACE_URL);
      });

      it('should return Marketplace request via onedisplay bidder code when' +
        'Marketplace and One Mobile GET params are present', () => {
        let bidParams = Object.assign(getMarketplaceBidParams(), getNexageGetBidParams());
        let bidRequest = createCustomBidRequest({
          bids: [{
            bidder: 'onedisplay'
          }],
          params: bidParams
        });

        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(MARKETPLACE_URL);
      });

      it('should return Marketplace request via onedisplay bidder code when' +
        'Marketplace and One Mobile GET + POST params are present', () => {
        let bidParams = Object.assign(getMarketplaceBidParams(), getNexageGetBidParams(), getNexagePostBidParams());
        let bidRequest = createCustomBidRequest({
          bids: [{
            bidder: 'onedisplay'
          }],
          params: bidParams
        });

        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(MARKETPLACE_URL);
      });

      it('should not resolve endpoint for onedisplay bidder code ' +
        'when only One Mobile params are present', () => {
        let bidParams = Object.assign(getNexageGetBidParams(), getNexagePostBidParams());
        let bidRequest = createCustomBidRequest({
          bids: [{
            bidder: 'onedisplay'
          }],
          params: bidParams
        });

        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request).to.be.empty;
      });

      it('should return Marketplace URL for eu region', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            region: 'eu'
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('adserver-eu.adtech.advertising.com/pubapi/3.0/');
      });

      it('should return Marketplace URL for eu region when server option is present', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            server: 'adserver-eu.adtech.advertising.com'
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('adserver-eu.adtech.advertising.com/pubapi/3.0/');
      });

      it('should return default Marketplace URL in case of unknown region config option', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            region: 'an'
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(MARKETPLACE_URL);
      });

      it('should return url with pubapi bid option', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('cmd=bid;');
      });

      it('should return url with version 2 of pubapi', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('v=2;');
      });

      it('should return url with cache busting option', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.match(/misc=\d+/);
      });

      it('should return url with default pageId and sizeId', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1'
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('/pubapi/3.0/9599.1/1234567/0/0/ADTECH;');
      });

      it('should return url with custom pageId and sizeId when options are present', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            pageId: 1111,
            sizeId: 2222
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('/pubapi/3.0/9599.1/1234567/1111/2222/ADTECH;');
      });

      it('should return url with default alias if alias param is missing', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.match(/alias=\w+?;/);
      });

      it('should return url with custom alias if it is present', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            alias: 'desktop_articlepage_something_box_300_250'
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('alias=desktop_articlepage_something_box_300_250');
      });

      it('should return url without bidfloor option if is is missing', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).not.to.contain('bidfloor=');
      });

      it('should return url with bidFloor option if it is present', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            bidFloor: 0.80
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('bidfloor=0.8');
      });

      it('should return url with key values if keyValues param is present', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            placement: 1234567,
            network: '9599.1',
            keyValues: {
              age: 25,
              height: 3.42,
              test: 'key'
            }
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('kvage=25;kvheight=3.42;kvtest=key');
      });

      it('should return request object for One Display when configuration is present', () => {
        let bidRequest = getDefaultBidRequest();
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.method).to.equal('GET');
        expect(request.ttl).to.equal(ONE_DISPLAY_TTL);
      });
    });

    describe('One Mobile', () => {
      it('should return One Mobile url when One Mobile get params are present', () => {
        let bidRequest = createCustomBidRequest({
          params: getNexageGetBidParams()
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(NEXAGE_URL);
      });

      it('should return One Mobile url with different host when host option is present', () => {
        let bidParams = Object.assign({
          host: 'qa-hb.nexage.com'
        }, getNexageGetBidParams());
        let bidRequest = createCustomBidRequest({
          params: bidParams
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('qa-hb.nexage.com/bidRequest?');
      });

      it('should return One Mobile url when One Mobile and Marketplace params are present', () => {
        let bidParams = Object.assign(getNexageGetBidParams(), getMarketplaceBidParams());
        let bidRequest = createCustomBidRequest({
          params: bidParams
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(NEXAGE_URL);
      });

      it('should return One Mobile url for onemobile bidder code ' +
        'when One Mobile GET and Marketplace params are present', () => {
        let bidParams = Object.assign(getNexageGetBidParams(), getMarketplaceBidParams());
        let bidRequest = createCustomBidRequest({
          bids: [{
            bidder: 'onemobile'
          }],
          params: bidParams
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(NEXAGE_URL);
      });

      it('should not return any url for onemobile bidder code' +
        'when only Marketplace params are present', () => {
        let bidRequest = createCustomBidRequest({
          bids: [{
            bidder: 'onemobile'
          }],
          params: getMarketplaceBidParams()
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request).to.be.empty;
      });

      it('should return One Mobile url with required params - dcn & pos', () => {
        let bidRequest = createCustomBidRequest({
          params: getNexageGetBidParams()
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(NEXAGE_URL + 'dcn=2c9d2b50015c5ce9db6aeeed8b9500d6&pos=header');
      });

      it('should return One Mobile url with cmd=bid option', () => {
        let bidRequest = createCustomBidRequest({
          params: getNexageGetBidParams()
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('cmd=bid');
      });

      it('should return One Mobile url with generic params if ext option is present', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            dcn: '54321123',
            pos: 'footer-2324',
            ext: {
              param1: 'val1',
              param2: 'val2',
              param3: 'val3',
              param4: 'val4'
            }
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain('hb.nexage.com/bidRequest?dcn=54321123&pos=footer-2324&cmd=bid' +
          '&param1=val1&param2=val2&param3=val3&param4=val4');
      });

      it('should return request object for One Mobile POST endpoint when POST configuration is present', () => {
        let bidConfig = getNexagePostBidParams();
        let bidRequest = createCustomBidRequest({
          params: bidConfig
        });

        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request.url).to.contain(NEXAGE_URL);
        expect(request.method).to.equal('POST');
        expect(request.ttl).to.equal(ONE_MOBILE_TTL);
        expect(request.data).to.deep.equal(bidConfig);
        expect(request.options).to.deep.equal({
          contentType: 'application/json',
          customHeaders: {
            'x-openrtb-version': '2.2'
          }
        });
      });

      it('should not return request object for One Mobile POST endpoint' +
        'if required parameterers are missed', () => {
        let bidRequest = createCustomBidRequest({
          params: {
            imp: []
          }
        });
        let [request] = spec.buildRequests(bidRequest.bids);
        expect(request).to.be.empty;
      });
    });
  });

  describe('getUserSyncs()', () => {
    let bidResponse;
    let bidRequest;

    beforeEach(() => {
      $$PREBID_GLOBAL$$.aolGlobals.pixelsDropped = false;
      config.setConfig({
        aol: {
          userSyncOn: 'bidResponse'
        },
      });
      bidResponse = getDefaultBidResponse();
      bidResponse.ext = {
        pixels: getPixels()
      };
    });

    it('should return user syncs only if userSyncOn equals to "bidResponse"', () => {
      let userSyncs = spec.getUserSyncs({}, [bidResponse], bidRequest);

      expect($$PREBID_GLOBAL$$.aolGlobals.pixelsDropped).to.be.true;
      expect(userSyncs).to.deep.equal([
        {type: 'image', url: 'img.org'},
        {type: 'iframe', url: 'pixels1.org'}
      ]);
    });

    it('should not return user syncs if it has already been returned', () => {
      $$PREBID_GLOBAL$$.aolGlobals.pixelsDropped = true;

      let userSyncs = spec.getUserSyncs({}, [bidResponse], bidRequest);

      expect($$PREBID_GLOBAL$$.aolGlobals.pixelsDropped).to.be.true;
      expect(userSyncs).to.deep.equal([]);
    });

    it('should not return user syncs if pixels are not present', () => {
      bidResponse.ext.pixels = null;

      let userSyncs = spec.getUserSyncs({}, [bidResponse], bidRequest);

      expect($$PREBID_GLOBAL$$.aolGlobals.pixelsDropped).to.be.false;
      expect(userSyncs).to.deep.equal([]);
    });
  });

  describe('formatPixels()', () => {
    it('should return pixels wrapped for dropping them once and within nested frames ', () => {
      let pixels = '<script>document.write(\'<pixels-dom-elements/>\');</script>';
      let formattedPixels = spec.formatPixels(pixels);

      expect(formattedPixels).to.equal(
        '<script>var w=window,prebid;' +
        'for(var i=0;i<10;i++){w = w.parent;prebid=w.$$PREBID_GLOBAL$$;' +
        'if(prebid && prebid.aolGlobals && !prebid.aolGlobals.pixelsDropped){' +
        'try{prebid.aolGlobals.pixelsDropped=true;' +
        'document.write(\'<pixels-dom-elements/>\');break;}' +
        'catch(e){continue;}' +
        '}}</script>');
    });
  });

  describe('isOneMobileBidder()', () => {
    it('should return false when when bidderCode is not present', () => {
      expect(spec.isOneMobileBidder(null)).to.be.false;
    });

    it('should return false for unknown bidder code', () => {
      expect(spec.isOneMobileBidder('unknownBidder')).to.be.false;
    });

    it('should return true for aol bidder code', () => {
      expect(spec.isOneMobileBidder('aol')).to.be.true;
    });

    it('should return true for one mobile bidder code', () => {
      expect(spec.isOneMobileBidder('onemobile')).to.be.true;
    });
  });

  describe('isConsentRequired()', () => {
    it('should return false when consentData object is not present', () => {
      expect(spec.isConsentRequired(null)).to.be.false;
    });

    it('should return true when gdprApplies equals true and consentString is not present', () => {
      let consentData = {
        consentString: null,
        gdprApplies: true
      };

      expect(spec.isConsentRequired(consentData)).to.be.true;
    });

    it('should return false when consentString is present and gdprApplies equals false', () => {
      let consentData = {
        consentString: 'consent-string',
        gdprApplies: false
      };

      expect(spec.isConsentRequired(consentData)).to.be.false;
    });

    it('should return true when consentString is present and gdprApplies equals true', () => {
      let consentData = {
        consentString: 'consent-string',
        gdprApplies: true
      };

      expect(spec.isConsentRequired(consentData)).to.be.true;
    });
  });

  describe('formatMarketplaceDynamicParams()', () => {
    let formatConsentDataStub;
    let formatKeyValuesStub;

    beforeEach(() => {
      formatConsentDataStub = sinon.stub(spec, 'formatConsentData');
      formatKeyValuesStub = sinon.stub(spec, 'formatKeyValues');
    });

    afterEach(() => {
      formatConsentDataStub.restore();
      formatKeyValuesStub.restore();
    });

    it('should return empty string when params are not present', () => {
      expect(spec.formatMarketplaceDynamicParams()).to.be.equal('');
    });

    it('should return formatted params when formatConsentData returns data', () => {
      formatConsentDataStub.returns({
        euconsent: 'test-consent',
        gdpr: 1
      });
      expect(spec.formatMarketplaceDynamicParams()).to.be.equal('euconsent=test-consent;gdpr=1;');
    });

    it('should return formatted params when formatKeyValues returns data', () => {
      formatKeyValuesStub.returns({
        param1: 'val1',
        param2: 'val2',
        param3: 'val3'
      });
      expect(spec.formatMarketplaceDynamicParams()).to.be.equal('param1=val1;param2=val2;param3=val3;');
    });

    it('should return formatted bid floor param when it is present', () => {
      let params = {
        bidFloor: 0.45
      };
      expect(spec.formatMarketplaceDynamicParams(params)).to.be.equal('bidfloor=0.45;');
    });
  });

  describe('formatOneMobileDynamicParams()', () => {
    let consentRequiredStub;
    let secureProtocolStub;

    beforeEach(() => {
      consentRequiredStub = sinon.stub(spec, 'isConsentRequired');
      secureProtocolStub = sinon.stub(spec, 'isSecureProtocol');
    });

    afterEach(() => {
      consentRequiredStub.restore();
      secureProtocolStub.restore();
    });

    it('should return empty string when params are not present', () => {
      expect(spec.formatOneMobileDynamicParams()).to.be.equal('');
    });

    it('should return formatted params when params are present', () => {
      let params = {
        param1: 'val1',
        param2: 'val2',
        param3: 'val3'
      };
      expect(spec.formatOneMobileDynamicParams(params)).to.contain('&param1=val1&param2=val2&param3=val3');
    });

    it('should return formatted gdpr params when isConsentRequired returns true', () => {
      let consentData = {
        consentString: 'test-consent'
      };
      consentRequiredStub.returns(true);
      expect(spec.formatOneMobileDynamicParams({}, consentData)).to.be.equal('&gdpr=1&euconsent=test-consent');
    });

    it('should return formatted secure param when isSecureProtocol returns true', () => {
      secureProtocolStub.returns(true);
      expect(spec.formatOneMobileDynamicParams()).to.be.equal('&secure=1');
    });
  });
});
