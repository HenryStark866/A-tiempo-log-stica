-- El certificado del Registro Nacional de Medidas Correctivas (RNMC) de la
-- Policía Nacional pasa a ser uno de los papeles que se le piden al mensajero.
--
-- Va en su propia migración porque un valor nuevo de enum no se puede usar en
-- la misma transacción en que se crea: la lista de requeridos cambia en 0085.
alter type public.at_doc_type add value if not exists 'certificado_medidas_correctivas';
