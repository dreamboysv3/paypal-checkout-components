/* @flow */

import { undotify, htmlEncode } from 'belter';
import { html } from 'jsx-pragmatic';
import { SDK_QUERY_KEYS } from 'paypal-sdk-constants';
import { unpackSDKMeta } from 'paypal-braintree-web-client';

import { getSmartButtonClientScript, getSmartButtonRenderScript, startWatchers } from './watcher';
import { getParams } from './params';
import { EVENT } from './constants';
import { serverErrorResponse, clientErrorResponse, htmlResponse, allowFrame } from './util';
import type { ExpressRequest, ExpressResponse, LoggerType } from './types';

export function getButtonMiddleware({ logger = console } : { logger? : LoggerType } = {}) : (req : ExpressRequest, res : ExpressResponse) => Promise<void> {
    startWatchers();

    return async function buttonMiddleware(req : ExpressRequest, res : ExpressResponse) : Promise<void> {
        try {
            logger.info(EVENT.RENDER);

            const { getSDKLoader } = unpackSDKMeta(req.query.sdkMeta);

            const [ buttonScript, { Buttons } ] = await Promise.all([
                getSmartButtonClientScript(),
                getSmartButtonRenderScript()
            ]);

            const params = undotify(req.query);
            const { clientID, country, lang, fundingEligibility, nonce } = getParams(params, req, res);

            if (!clientID) {
                return clientErrorResponse(res, 'Please provide a clientID query parameter');
            }

            if (!fundingEligibility) {
                return clientErrorResponse(res, 'Please provide a fundingEligibility query parameter');
            }

            const buttonHTML = Buttons({ ...params, nonce, fundingEligibility }).render(html());

            const pageHTML = `
                <body>
                    ${ buttonHTML }
                    ${ getSDKLoader() }
                    <script src="/sdk/js?client-id=${ htmlEncode(clientID) }&${ SDK_QUERY_KEYS.LOCALE_COUNTRY }=${ htmlEncode(country) }&${ SDK_QUERY_KEYS.LOCALE_LANG }=${ htmlEncode(lang) }&${ SDK_QUERY_KEYS.COMPONENTS }=buttons,checkout"></script>
                    <script nonce="${ nonce }">${ buttonScript }</script>
                    <script nonce="${ nonce }">spb.setupButton()</script>
                </body>
            `;

            allowFrame(res);
            return htmlResponse(res, pageHTML);

        } catch (err) {
            console.error(err.stack ? err.stack : err); // eslint-disable-line no-console
            logger.error(req, EVENT.ERROR, { err: err.stack ? err.stack : err.toString() });
            return serverErrorResponse(res, err.stack ? err.stack : err.toString());
        }
    };
}

