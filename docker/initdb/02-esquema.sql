-- Easy Search: esquema completo de la base de datos (PostgreSQL 16 + pgvector).
-- Generado con scripts/exportar_sql_inicial.py el 2026-11-24 20:51.
-- Lo ejecuta PostgreSQL solo la primera vez que se crea la base (docker/initdb).
-- Incluye la versión de Alembic: al arrancar, `alembic upgrade head` no tiene nada que aplicar.

--
-- PostgreSQL database dump
--

\restrict Ih6C4V03gWpDEmT2k0vsNV8LelNNn7ChII3Awu1oskJZap1Q0vJa2caTQABoGO2

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg12+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg12+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: calificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calificaciones (
    id integer NOT NULL,
    respuesta_id integer NOT NULL,
    puntuacion smallint NOT NULL,
    comentario character varying(500),
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizada_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_calificaciones_puntuacion_rango CHECK (((puntuacion >= 1) AND (puntuacion <= 5)))
);


--
-- Name: calificaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calificaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calificaciones_id_seq OWNED BY public.calificaciones.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    parent_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: consultas_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultas_ia (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    pregunta character varying(500) NOT NULL,
    estado character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    umbral numeric(4,3) NOT NULL,
    mejor_similitud numeric(5,4),
    detalle_error character varying(300),
    duracion_ms integer,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    respondida_en timestamp with time zone,
    CONSTRAINT ck_consultas_ia_estado_valido CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'RESPONDIDA'::character varying, 'SIN_RESULTADOS'::character varying, 'ERROR'::character varying])::text[]))),
    CONSTRAINT ck_consultas_ia_pregunta_no_vacia CHECK ((char_length(btrim((pregunta)::text)) >= 3)),
    CONSTRAINT ck_consultas_ia_similitud_rango CHECK (((mejor_similitud IS NULL) OR ((mejor_similitud >= ('-1'::integer)::numeric) AND (mejor_similitud <= (1)::numeric)))),
    CONSTRAINT ck_consultas_ia_umbral_rango CHECK (((umbral > (0)::numeric) AND (umbral < (1)::numeric)))
);


--
-- Name: consultas_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consultas_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consultas_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consultas_ia_id_seq OWNED BY public.consultas_ia.id;


--
-- Name: duplicate_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duplicate_dismissals (
    id integer NOT NULL,
    establishment_a_id integer NOT NULL,
    establishment_b_id integer NOT NULL,
    dismissed_by_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_duplicate_dismissals_ordered_pair CHECK ((establishment_a_id < establishment_b_id))
);


--
-- Name: duplicate_dismissals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.duplicate_dismissals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: duplicate_dismissals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.duplicate_dismissals_id_seq OWNED BY public.duplicate_dismissals.id;


--
-- Name: embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embeddings (
    id integer NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id integer NOT NULL,
    establishment_id integer NOT NULL,
    content text NOT NULL,
    content_hash character varying(64) NOT NULL,
    model character varying(100) NOT NULL,
    embedding public.vector(384) NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_embeddings_entity_valid CHECK (((entity_type)::text = ANY ((ARRAY['establishment'::character varying, 'offering'::character varying])::text[])))
);


--
-- Name: embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.embeddings_id_seq OWNED BY public.embeddings.id;


--
-- Name: establishment_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_categories (
    establishment_id integer NOT NULL,
    category_id integer NOT NULL
);


--
-- Name: establishment_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment_photos (
    id integer NOT NULL,
    establishment_id integer NOT NULL,
    url character varying(500) NOT NULL,
    caption character varying(200),
    sort_order integer DEFAULT 0 NOT NULL,
    uploaded_by_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: establishment_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.establishment_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: establishment_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.establishment_photos_id_seq OWNED BY public.establishment_photos.id;


--
-- Name: establishments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishments (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(220) NOT NULL,
    description text,
    address character varying(300),
    neighborhood character varying(200),
    municipality_id integer,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    timezone character varying(50) DEFAULT 'America/Bogota'::character varying NOT NULL,
    phone character varying(50),
    whatsapp character varying(50),
    email character varying(255),
    website character varying(300),
    instagram character varying(300),
    facebook character varying(300),
    price_min numeric(12,2),
    price_max numeric(12,2),
    price_level smallint,
    rating_avg numeric(3,2),
    rating_count integer DEFAULT 0 NOT NULL,
    hours_verified_at timestamp with time zone,
    owner_id integer,
    is_verified boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    duplicate_of_id integer,
    source character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    osm_type character varying(10),
    osm_id bigint,
    osm_tags jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_establishments_price_level_range CHECK (((price_level IS NULL) OR ((price_level >= 1) AND (price_level <= 4)))),
    CONSTRAINT ck_establishments_price_range CHECK (((price_min IS NULL) OR (price_max IS NULL) OR (price_min <= price_max))),
    CONSTRAINT ck_establishments_source_valid CHECK (((source)::text = ANY ((ARRAY['osm'::character varying, 'manual'::character varying, 'owner'::character varying])::text[]))),
    CONSTRAINT ck_establishments_status_valid CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'hidden'::character varying, 'duplicate'::character varying])::text[])))
);


--
-- Name: establishments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.establishments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: establishments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.establishments_id_seq OWNED BY public.establishments.id;


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    user_id integer NOT NULL,
    establishment_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: fuentes_respuesta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fuentes_respuesta (
    id integer NOT NULL,
    respuesta_id integer NOT NULL,
    establecimiento_id integer,
    nombre_establecimiento character varying(200) NOT NULL,
    similitud numeric(5,4) NOT NULL,
    posicion smallint NOT NULL,
    CONSTRAINT ck_fuentes_respuesta_posicion_rango CHECK (((posicion >= 1) AND (posicion <= 10))),
    CONSTRAINT ck_fuentes_respuesta_similitud_rango CHECK (((similitud >= ('-1'::integer)::numeric) AND (similitud <= (1)::numeric)))
);


--
-- Name: fuentes_respuesta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fuentes_respuesta_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fuentes_respuesta_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fuentes_respuesta_id_seq OWNED BY public.fuentes_respuesta.id;


--
-- Name: offerings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerings (
    id integer NOT NULL,
    establishment_id integer NOT NULL,
    kind character varying(10) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    price numeric(12,2),
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    section character varying(60),
    CONSTRAINT ck_offerings_kind_valid CHECK (((kind)::text = ANY ((ARRAY['product'::character varying, 'service'::character varying])::text[]))),
    CONSTRAINT ck_offerings_price_positive CHECK (((price IS NULL) OR (price >= (0)::numeric)))
);


--
-- Name: offerings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerings_id_seq OWNED BY public.offerings.id;


--
-- Name: opening_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opening_hours (
    id integer NOT NULL,
    establishment_id integer NOT NULL,
    day_of_week smallint NOT NULL,
    opens_at time without time zone NOT NULL,
    closes_at time without time zone NOT NULL,
    CONSTRAINT ck_opening_hours_day_valid CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: opening_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opening_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opening_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opening_hours_id_seq OWNED BY public.opening_hours.id;


--
-- Name: ownership_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ownership_claims (
    id integer NOT NULL,
    establishment_id integer,
    user_id integer NOT NULL,
    message text,
    contact_phone character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by_id integer,
    reviewed_at timestamp with time zone,
    review_note character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind character varying(20) DEFAULT 'claim'::character varying NOT NULL,
    applicant_role character varying(20),
    applicant_position character varying(100),
    proposed_data jsonb,
    consent_at timestamp with time zone,
    CONSTRAINT ck_ownership_claims_applicant_role_valid CHECK (((applicant_role IS NULL) OR ((applicant_role)::text = ANY ((ARRAY['dueno'::character varying, 'encargado'::character varying])::text[])))),
    CONSTRAINT ck_ownership_claims_claim_has_establishment CHECK ((((kind)::text = 'register'::text) OR (establishment_id IS NOT NULL))),
    CONSTRAINT ck_ownership_claims_kind_valid CHECK (((kind)::text = ANY ((ARRAY['claim'::character varying, 'register'::character varying])::text[]))),
    CONSTRAINT ck_ownership_claims_register_has_data CHECK ((((kind)::text = 'claim'::text) OR (proposed_data IS NOT NULL))),
    CONSTRAINT ck_ownership_claims_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: ownership_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ownership_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ownership_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ownership_claims_id_seq OWNED BY public.ownership_claims.id;


--
-- Name: places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.places (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    normalized_name character varying(200) NOT NULL,
    kind character varying(20) NOT NULL,
    parent_id integer,
    department character varying(100),
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    osm_type character varying(10),
    osm_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_places_kind_valid CHECK (((kind)::text = ANY ((ARRAY['municipio'::character varying, 'barrio'::character varying])::text[])))
);


--
-- Name: places_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.places_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: places_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.places_id_seq OWNED BY public.places.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    reporter_id integer,
    establishment_id integer,
    review_id integer,
    report_type character varying(30) NOT NULL,
    message text,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    resolved_by_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_reports_status_valid CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::text[]))),
    CONSTRAINT ck_reports_type_valid CHECK (((report_type)::text = ANY ((ARRAY['incorrect_info'::character varying, 'duplicate'::character varying, 'closed'::character varying, 'inappropriate_review'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: respuestas_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.respuestas_ia (
    id integer NOT NULL,
    consulta_id integer NOT NULL,
    respuesta text NOT NULL,
    pasos text[] DEFAULT '{}'::text[] NOT NULL,
    modelo character varying(60),
    creada_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: respuestas_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.respuestas_ia_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: respuestas_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.respuestas_ia_id_seq OWNED BY public.respuestas_ia.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    establishment_id integer NOT NULL,
    user_id integer NOT NULL,
    rating smallint NOT NULL,
    comment text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    moderation_reason character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_reply text,
    owner_reply_at timestamp with time zone,
    CONSTRAINT ck_reviews_rating_range CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT ck_reviews_status_valid CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: search_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_history (
    id integer NOT NULL,
    user_id integer,
    query_text character varying(500) NOT NULL,
    parsed_query jsonb,
    location_label character varying(200),
    results_count integer DEFAULT 0 NOT NULL,
    hidden_by_user boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: search_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_history_id_seq OWNED BY public.search_history.id;


--
-- Name: special_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.special_hours (
    id integer NOT NULL,
    establishment_id integer NOT NULL,
    date date NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    opens_at time without time zone,
    closes_at time without time zone,
    note character varying(200),
    CONSTRAINT ck_special_hours_hours_required CHECK ((is_closed OR ((opens_at IS NOT NULL) AND (closes_at IS NOT NULL))))
);


--
-- Name: special_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.special_hours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: special_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.special_hours_id_seq OWNED BY public.special_hours.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(120) NOT NULL,
    role character varying(10) DEFAULT 'user'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_changed_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    verification_code_hash character varying(64),
    verification_code_expires_at timestamp with time zone,
    verification_attempts integer DEFAULT 0 NOT NULL,
    reset_code_hash character varying(64),
    reset_code_expires_at timestamp with time zone,
    reset_attempts integer DEFAULT 0 NOT NULL,
    notify_new_reviews boolean DEFAULT true NOT NULL,
    notify_review_replies boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_users_role_valid CHECK (((role)::text = ANY ((ARRAY['user'::character varying, 'owner'::character varying, 'admin'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: calificaciones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones ALTER COLUMN id SET DEFAULT nextval('public.calificaciones_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: consultas_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultas_ia ALTER COLUMN id SET DEFAULT nextval('public.consultas_ia_id_seq'::regclass);


--
-- Name: duplicate_dismissals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_dismissals ALTER COLUMN id SET DEFAULT nextval('public.duplicate_dismissals_id_seq'::regclass);


--
-- Name: embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings ALTER COLUMN id SET DEFAULT nextval('public.embeddings_id_seq'::regclass);


--
-- Name: establishment_photos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_photos ALTER COLUMN id SET DEFAULT nextval('public.establishment_photos_id_seq'::regclass);


--
-- Name: establishments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments ALTER COLUMN id SET DEFAULT nextval('public.establishments_id_seq'::regclass);


--
-- Name: fuentes_respuesta id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fuentes_respuesta ALTER COLUMN id SET DEFAULT nextval('public.fuentes_respuesta_id_seq'::regclass);


--
-- Name: offerings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerings ALTER COLUMN id SET DEFAULT nextval('public.offerings_id_seq'::regclass);


--
-- Name: opening_hours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_hours ALTER COLUMN id SET DEFAULT nextval('public.opening_hours_id_seq'::regclass);


--
-- Name: ownership_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership_claims ALTER COLUMN id SET DEFAULT nextval('public.ownership_claims_id_seq'::regclass);


--
-- Name: places id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places ALTER COLUMN id SET DEFAULT nextval('public.places_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: respuestas_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas_ia ALTER COLUMN id SET DEFAULT nextval('public.respuestas_ia_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: search_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_history ALTER COLUMN id SET DEFAULT nextval('public.search_history_id_seq'::regclass);


--
-- Name: special_hours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.special_hours ALTER COLUMN id SET DEFAULT nextval('public.special_hours_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: calificaciones pk_calificaciones; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT pk_calificaciones PRIMARY KEY (id);


--
-- Name: categories pk_categories; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT pk_categories PRIMARY KEY (id);


--
-- Name: consultas_ia pk_consultas_ia; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultas_ia
    ADD CONSTRAINT pk_consultas_ia PRIMARY KEY (id);


--
-- Name: duplicate_dismissals pk_duplicate_dismissals; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_dismissals
    ADD CONSTRAINT pk_duplicate_dismissals PRIMARY KEY (id);


--
-- Name: embeddings pk_embeddings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT pk_embeddings PRIMARY KEY (id);


--
-- Name: establishment_categories pk_establishment_categories; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_categories
    ADD CONSTRAINT pk_establishment_categories PRIMARY KEY (establishment_id, category_id);


--
-- Name: establishment_photos pk_establishment_photos; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_photos
    ADD CONSTRAINT pk_establishment_photos PRIMARY KEY (id);


--
-- Name: establishments pk_establishments; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT pk_establishments PRIMARY KEY (id);


--
-- Name: favorites pk_favorites; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT pk_favorites PRIMARY KEY (user_id, establishment_id);


--
-- Name: fuentes_respuesta pk_fuentes_respuesta; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fuentes_respuesta
    ADD CONSTRAINT pk_fuentes_respuesta PRIMARY KEY (id);


--
-- Name: offerings pk_offerings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT pk_offerings PRIMARY KEY (id);


--
-- Name: opening_hours pk_opening_hours; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_hours
    ADD CONSTRAINT pk_opening_hours PRIMARY KEY (id);


--
-- Name: ownership_claims pk_ownership_claims; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership_claims
    ADD CONSTRAINT pk_ownership_claims PRIMARY KEY (id);


--
-- Name: places pk_places; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT pk_places PRIMARY KEY (id);


--
-- Name: reports pk_reports; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT pk_reports PRIMARY KEY (id);


--
-- Name: respuestas_ia pk_respuestas_ia; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas_ia
    ADD CONSTRAINT pk_respuestas_ia PRIMARY KEY (id);


--
-- Name: reviews pk_reviews; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT pk_reviews PRIMARY KEY (id);


--
-- Name: search_history pk_search_history; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_history
    ADD CONSTRAINT pk_search_history PRIMARY KEY (id);


--
-- Name: special_hours pk_special_hours; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.special_hours
    ADD CONSTRAINT pk_special_hours PRIMARY KEY (id);


--
-- Name: users pk_users; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT pk_users PRIMARY KEY (id);


--
-- Name: calificaciones uq_calificaciones_respuesta_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT uq_calificaciones_respuesta_id UNIQUE (respuesta_id);


--
-- Name: categories uq_categories_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT uq_categories_slug UNIQUE (slug);


--
-- Name: duplicate_dismissals uq_duplicate_dismissals_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_dismissals
    ADD CONSTRAINT uq_duplicate_dismissals_pair UNIQUE (establishment_a_id, establishment_b_id);


--
-- Name: embeddings uq_embeddings_entity; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT uq_embeddings_entity UNIQUE (entity_type, entity_id);


--
-- Name: establishments uq_establishments_osm; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT uq_establishments_osm UNIQUE (osm_type, osm_id);


--
-- Name: establishments uq_establishments_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT uq_establishments_slug UNIQUE (slug);


--
-- Name: fuentes_respuesta uq_fuentes_respuesta_respuesta_establecimiento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fuentes_respuesta
    ADD CONSTRAINT uq_fuentes_respuesta_respuesta_establecimiento UNIQUE (respuesta_id, establecimiento_id);


--
-- Name: places uq_places_osm; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT uq_places_osm UNIQUE (osm_type, osm_id);


--
-- Name: respuestas_ia uq_respuestas_ia_consulta_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas_ia
    ADD CONSTRAINT uq_respuestas_ia_consulta_id UNIQUE (consulta_id);


--
-- Name: reviews uq_reviews_user_establishment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT uq_reviews_user_establishment UNIQUE (user_id, establishment_id);


--
-- Name: ix_consultas_ia_creada_en; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_consultas_ia_creada_en ON public.consultas_ia USING btree (creada_en);


--
-- Name: ix_consultas_ia_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_consultas_ia_estado ON public.consultas_ia USING btree (estado);


--
-- Name: ix_consultas_ia_usuario_creada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_consultas_ia_usuario_creada ON public.consultas_ia USING btree (usuario_id, creada_en DESC);


--
-- Name: ix_embeddings_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_embeddings_establishment_id ON public.embeddings USING btree (establishment_id);


--
-- Name: ix_embeddings_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_embeddings_hnsw ON public.embeddings USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: ix_establishment_photos_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishment_photos_establishment_id ON public.establishment_photos USING btree (establishment_id);


--
-- Name: ix_establishments_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishments_lat_lng ON public.establishments USING btree (latitude, longitude);


--
-- Name: ix_establishments_municipality_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishments_municipality_id ON public.establishments USING btree (municipality_id);


--
-- Name: ix_establishments_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishments_owner_id ON public.establishments USING btree (owner_id);


--
-- Name: ix_fuentes_respuesta_establecimiento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fuentes_respuesta_establecimiento_id ON public.fuentes_respuesta USING btree (establecimiento_id);


--
-- Name: ix_fuentes_respuesta_respuesta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_fuentes_respuesta_respuesta_id ON public.fuentes_respuesta USING btree (respuesta_id);


--
-- Name: ix_offerings_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_offerings_establishment_id ON public.offerings USING btree (establishment_id);


--
-- Name: ix_opening_hours_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_opening_hours_establishment_id ON public.opening_hours USING btree (establishment_id);


--
-- Name: ix_ownership_claims_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ownership_claims_establishment_id ON public.ownership_claims USING btree (establishment_id);


--
-- Name: ix_ownership_claims_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ownership_claims_user_id ON public.ownership_claims USING btree (user_id);


--
-- Name: ix_places_normalized_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_places_normalized_name ON public.places USING btree (normalized_name);


--
-- Name: ix_reviews_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reviews_establishment_id ON public.reviews USING btree (establishment_id);


--
-- Name: ix_reviews_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reviews_user_id ON public.reviews USING btree (user_id);


--
-- Name: ix_search_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_search_history_created_at ON public.search_history USING btree (created_at);


--
-- Name: ix_search_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_search_history_user_id ON public.search_history USING btree (user_id);


--
-- Name: ix_special_hours_establishment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_special_hours_establishment_id ON public.special_hours USING btree (establishment_id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: calificaciones fk_calificaciones_respuesta_id_respuestas_ia; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT fk_calificaciones_respuesta_id_respuestas_ia FOREIGN KEY (respuesta_id) REFERENCES public.respuestas_ia(id) ON DELETE CASCADE;


--
-- Name: categories fk_categories_parent_id_categories; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT fk_categories_parent_id_categories FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: consultas_ia fk_consultas_ia_usuario_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultas_ia
    ADD CONSTRAINT fk_consultas_ia_usuario_id_users FOREIGN KEY (usuario_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: duplicate_dismissals fk_duplicate_dismissals_dismissed_by_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_dismissals
    ADD CONSTRAINT fk_duplicate_dismissals_dismissed_by_id_users FOREIGN KEY (dismissed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: duplicate_dismissals fk_duplicate_dismissals_establishment_a_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_dismissals
    ADD CONSTRAINT fk_duplicate_dismissals_establishment_a_id_establishments FOREIGN KEY (establishment_a_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: duplicate_dismissals fk_duplicate_dismissals_establishment_b_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_dismissals
    ADD CONSTRAINT fk_duplicate_dismissals_establishment_b_id_establishments FOREIGN KEY (establishment_b_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: embeddings fk_embeddings_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embeddings
    ADD CONSTRAINT fk_embeddings_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_categories fk_establishment_categories_category_id_categories; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_categories
    ADD CONSTRAINT fk_establishment_categories_category_id_categories FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: establishment_categories fk_establishment_categories_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_categories
    ADD CONSTRAINT fk_establishment_categories_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_photos fk_establishment_photos_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_photos
    ADD CONSTRAINT fk_establishment_photos_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: establishment_photos fk_establishment_photos_uploaded_by_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment_photos
    ADD CONSTRAINT fk_establishment_photos_uploaded_by_id_users FOREIGN KEY (uploaded_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: establishments fk_establishments_duplicate_of_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT fk_establishments_duplicate_of_id_establishments FOREIGN KEY (duplicate_of_id) REFERENCES public.establishments(id) ON DELETE SET NULL;


--
-- Name: establishments fk_establishments_municipality_id_places; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT fk_establishments_municipality_id_places FOREIGN KEY (municipality_id) REFERENCES public.places(id) ON DELETE SET NULL;


--
-- Name: establishments fk_establishments_owner_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishments
    ADD CONSTRAINT fk_establishments_owner_id_users FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: favorites fk_favorites_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT fk_favorites_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: favorites fk_favorites_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT fk_favorites_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fuentes_respuesta fk_fuentes_respuesta_establecimiento_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fuentes_respuesta
    ADD CONSTRAINT fk_fuentes_respuesta_establecimiento_id_establishments FOREIGN KEY (establecimiento_id) REFERENCES public.establishments(id) ON DELETE SET NULL;


--
-- Name: fuentes_respuesta fk_fuentes_respuesta_respuesta_id_respuestas_ia; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fuentes_respuesta
    ADD CONSTRAINT fk_fuentes_respuesta_respuesta_id_respuestas_ia FOREIGN KEY (respuesta_id) REFERENCES public.respuestas_ia(id) ON DELETE CASCADE;


--
-- Name: offerings fk_offerings_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerings
    ADD CONSTRAINT fk_offerings_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: opening_hours fk_opening_hours_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opening_hours
    ADD CONSTRAINT fk_opening_hours_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: ownership_claims fk_ownership_claims_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership_claims
    ADD CONSTRAINT fk_ownership_claims_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: ownership_claims fk_ownership_claims_reviewed_by_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership_claims
    ADD CONSTRAINT fk_ownership_claims_reviewed_by_id_users FOREIGN KEY (reviewed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ownership_claims fk_ownership_claims_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership_claims
    ADD CONSTRAINT fk_ownership_claims_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: places fk_places_parent_id_places; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.places
    ADD CONSTRAINT fk_places_parent_id_places FOREIGN KEY (parent_id) REFERENCES public.places(id) ON DELETE CASCADE;


--
-- Name: reports fk_reports_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: reports fk_reports_reporter_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_reporter_id_users FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reports fk_reports_resolved_by_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_resolved_by_id_users FOREIGN KEY (resolved_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reports fk_reports_review_id_reviews; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_review_id_reviews FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;


--
-- Name: respuestas_ia fk_respuestas_ia_consulta_id_consultas_ia; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respuestas_ia
    ADD CONSTRAINT fk_respuestas_ia_consulta_id_consultas_ia FOREIGN KEY (consulta_id) REFERENCES public.consultas_ia(id) ON DELETE CASCADE;


--
-- Name: reviews fk_reviews_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- Name: reviews fk_reviews_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: search_history fk_search_history_user_id_users; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_history
    ADD CONSTRAINT fk_search_history_user_id_users FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: special_hours fk_special_hours_establishment_id_establishments; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.special_hours
    ADD CONSTRAINT fk_special_hours_establishment_id_establishments FOREIGN KEY (establishment_id) REFERENCES public.establishments(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Ih6C4V03gWpDEmT2k0vsNV8LelNNn7ChII3Awu1oskJZap1Q0vJa2caTQABoGO2


-- Versión de las migraciones con la que se generó este esquema
INSERT INTO public.alembic_version (version_num) VALUES ('e2f3a4b5c6d7');
