const AWS = require('aws-sdk');
var crypto = require('crypto');
var querystring = require('query-string');
let endpoint = '';
let languageCode = '';
let sampleRate = '';
const region = process.env.REGION;
const key = process.env.ACCESS_KEY_ID;
const secret = process.env.SECRET;



// Copied from https://github.com/department-stockholm/aws-signature-v4
// and fixed the sorting of query parameters by using 'query-string' package instead of 'querystring'
// modified to use with this lambda

exports.createCanonicalRequest = function(method, pathname, query, headers, payload) {
    return [
        method.toUpperCase(),
        pathname,
        exports.createCanonicalQueryString(query),
        exports.createCanonicalHeaders(headers),
        exports.createSignedHeaders(headers),
        payload
    ].join('\n');
};

exports.createCanonicalQueryString = function(params) {
    return Object.keys(params).sort().map(function(key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
};

exports.createSignedHeaders = function(headers) {
    return Object.keys(headers).sort().map(function(name) {
        return name.toLowerCase().trim();
    }).join(';');
};

exports.createCredentialScope = function(time, region, service) {
    return [toDate(time), region, service, 'aws4_request'].join('/');
};

exports.createCanonicalHeaders = function(headers) {
    return Object.keys(headers).sort().map(function(name) {
        return name.toLowerCase().trim() + ':' + headers[name].toString().trim() + '\n';
    }).join('');
};

exports.createStringToSign = function(time, region, service, request) {
    return [
        'AWS4-HMAC-SHA256',
        toTime(time),
        exports.createCredentialScope(time, region, service),
        hash(request, 'hex')
    ].join('\n');
};

exports.createSignature = function(secret, time, region, service, stringToSign) {
    var h1 = hmac('AWS4' + secret, toDate(time)); // date-key
    var h2 = hmac(h1, region); // region-key
    var h3 = hmac(h2, service); // service-key
    var h4 = hmac(h3, 'aws4_request'); // signing-key
    return hmac(h4, stringToSign, 'hex');
};

exports.createPresignedURL = function(method, host, path, service, payload, options) {
    options = options || {};
    options.key = options.key;
    options.secret = options.secret;
    options.protocol = options.protocol || 'https';
    options.headers = options.headers || {};
    options.timestamp = options.timestamp || Date.now();
    options.region = options.region;
    options.expires = options.expires || 86400; // 24 hours
    options.headers = options.headers || {};

    // host is required
    options.headers.Host = host;

    var query = options.query ? querystring.parse(options.query) : {};
    query['X-Amz-Algorithm'] = 'AWS4-HMAC-SHA256';
    query['X-Amz-Credential'] = options.key + '/' + exports.createCredentialScope(options.timestamp, options.region, service);
    query['X-Amz-Date'] = toTime(options.timestamp);
    query['X-Amz-Expires'] = options.expires;
    query['X-Amz-SignedHeaders'] = exports.createSignedHeaders(options.headers);
    if (options.sessionToken) {
        query['X-Amz-Security-Token'] = options.sessionToken;
    }

    var canonicalRequest = exports.createCanonicalRequest(method, path, query, options.headers, payload);
    var stringToSign = exports.createStringToSign(options.timestamp, options.region, service, canonicalRequest);
    var signature = exports.createSignature(options.secret, options.timestamp, options.region, service, stringToSign);
    query['X-Amz-Signature'] = signature;
    return options.protocol + '://' + host + path + '?' + querystring.stringify(query);
};

function toTime(time) {
    return new Date(time).toISOString().replace(/[:\-]|\.\d{3}/g, '');
}

function toDate(time) {
    return toTime(time).substring(0, 8);
}

function hmac(key, string, encoding) {
    return crypto.createHmac('sha256', key)
    .update(string, 'utf8')
    .digest(encoding);
}

function hash(string, encoding) {
    return crypto.createHash('sha256')
    .update(string, 'utf8')
    .digest(encoding);
}


exports.handler = async (event) => {
    languageCode =  event.language;
    console.log("request: ", languageCode); 
    
    languageCode = (languageCode === undefined) ? 'en-US' : languageCode;

    console.log('languageCode:', languageCode);

    
    if (languageCode == "en-US" || languageCode == "es-US"){
        sampleRate = 44100;
    }else{
        sampleRate = 8000;
    }
    let endpoint = "transcribestreaming." + region + ".amazonaws.com:8443";
    let url = exports.createPresignedURL(
        'GET',
        endpoint,
        '/stream-transcription-websocket',
        'transcribe',
        crypto.createHash('sha256').update('', 'utf8').digest('hex'), {
            'key': key,
            'secret': secret,
            'sessionToken': '',
            'protocol': 'wss',
            'expires': 90,
            'region': region,
            'query': "language-code=" + languageCode + "&media-encoding=pcm&sample-rate=" + sampleRate
        }
    )
    return url;
};