/**
 * Sample WSFE SOAP responses for testing the parser. Shapes mirror real
 * AFIP responses (verified against homo + prod calls).
 */

export const FE_DUMMY_OK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FEDummyResult>
        <AppServer>OK</AppServer>
        <DbServer>OK</DbServer>
        <AuthServer>OK</AuthServer>
      </FEDummyResult>
    </FEDummyResponse>
  </soap:Body>
</soap:Envelope>`;

export const FE_ULTIMO_AUTORIZADO_OK = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECompUltimoAutorizadoResult>
        <PtoVta>1</PtoVta>
        <CbteTipo>11</CbteTipo>
        <CbteNro>42</CbteNro>
      </FECompUltimoAutorizadoResult>
    </FECompUltimoAutorizadoResponse>
  </soap:Body>
</soap:Envelope>`;

export const FE_SOLICITAR_CAE_APROBADO = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp>
          <Cuit>20417581015</Cuit>
          <PtoVta>1</PtoVta>
          <CbteTipo>11</CbteTipo>
          <FchProceso>20260506</FchProceso>
          <CantReg>1</CantReg>
          <Resultado>A</Resultado>
          <Reproceso>N</Reproceso>
        </FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <Concepto>2</Concepto>
            <DocTipo>80</DocTipo>
            <DocNro>20417581015</DocNro>
            <CbteDesde>43</CbteDesde>
            <CbteHasta>43</CbteHasta>
            <CbteFch>20260506</CbteFch>
            <Resultado>A</Resultado>
            <CAE>76123456789012</CAE>
            <CAEFchVto>20260516</CAEFchVto>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soap:Body>
</soap:Envelope>`;

export const FE_SOLICITAR_CAE_RECHAZADO = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FECAESolicitarResult>
        <FeCabResp>
          <Cuit>20417581015</Cuit>
          <PtoVta>1</PtoVta>
          <CbteTipo>11</CbteTipo>
          <FchProceso>20260506</FchProceso>
          <CantReg>1</CantReg>
          <Resultado>R</Resultado>
        </FeCabResp>
        <FeDetResp>
          <FECAEDetResponse>
            <Concepto>2</Concepto>
            <DocTipo>80</DocTipo>
            <DocNro>20417581015</DocNro>
            <CbteDesde>43</CbteDesde>
            <CbteHasta>43</CbteHasta>
            <CbteFch>20260506</CbteFch>
            <Resultado>R</Resultado>
            <Observaciones>
              <Obs>
                <Code>10048</Code>
                <Msg>Importe Total no es igual a la suma de los importes</Msg>
              </Obs>
            </Observaciones>
          </FECAEDetResponse>
        </FeDetResp>
      </FECAESolicitarResult>
    </FECAESolicitarResponse>
  </soap:Body>
</soap:Envelope>`;

export const FE_SOAP_FAULT = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Token expired</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

export const FE_PARAM_TIPOS_CBTE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FEParamGetTiposCbteResponse xmlns="http://ar.gov.afip.dif.FEV1/">
      <FEParamGetTiposCbteResult>
        <ResultGet>
          <CbteTipo>
            <Id>1</Id>
            <Desc>Factura A</Desc>
            <FchDesde>20100917</FchDesde>
            <FchHasta>NULL</FchHasta>
          </CbteTipo>
          <CbteTipo>
            <Id>11</Id>
            <Desc>Factura C</Desc>
            <FchDesde>20100917</FchDesde>
          </CbteTipo>
        </ResultGet>
      </FEParamGetTiposCbteResult>
    </FEParamGetTiposCbteResponse>
  </soap:Body>
</soap:Envelope>`;
