/**
 * Configuration Loader - Multi-tenant Config Management
 *
 * In production:
 * - Loads from PostgreSQL
 * - Caches in Redis
 * - Invalidates on updates
 *
 * For MVP:
 * - Loads from in-memory config
 * - Can be easily replaced with DB queries
 */

// Sample business configurations (in production, these come from DB)
const BUSINESS_CONFIGS = {
  spa_001: {
    tenant_id: 'spa_001',
    business_name: 'Relaxed Retreat Spa',
    country: 'NZ',
    phone_number: '+64 9 123 4567',

    greeting_message: 'Hi, welcome to Relaxed Retreat Spa. I can help you book an appointment, reschedule, or answer questions.',

    services: [
      {
        id: 'massage_60',
        name: 'Relaxation Massage',
        duration_minutes: 60,
        cliniko_service_id: 'svc_abc123'
      },
      {
        id: 'massage_90',
        name: 'Deep Tissue Massage',
        duration_minutes: 90,
        cliniko_service_id: 'svc_abc124'
      },
      {
        id: 'facial_45',
        name: 'Facial',
        duration_minutes: 45,
        cliniko_service_id: 'svc_def456'
      },
      {
        id: 'facial_60',
        name: 'Custom Facial',
        duration_minutes: 60,
        cliniko_service_id: 'svc_def457'
      }
    ],

    business_hours: {
      monday: { open: '09:00', close: '18:00' },
      tuesday: { open: '09:00', close: '18:00' },
      wednesday: { open: '09:00', close: '20:00' },
      thursday: { open: '09:00', close: '18:00' },
      friday: { open: '09:00', close: '21:00' },
      saturday: { open: '10:00', close: '17:00' },
      sunday: null
    },

    escalation_rules: {
      transfer_on_request: true,
      transfer_on_high_confidence_failure: true,
      transfer_on_frustration: true,
      human_queue_id: 'queue_xyz_001'
    },

    booking_rules: {
      allow_cancellation: true,
      allow_rescheduling: true,
      min_advance_booking_hours: 2,
      max_advance_booking_days: 60,
      cancellation_policy_url: 'https://relaxedretreat.co.nz/cancellation'
    },

    integrations: {
      cliniko: {
        api_key: 'ENCRYPTED_KEY_HERE',
        business_id: 'cliniko_spa_001'
      },
      sms: {
        from_number: '+64 2 0123 456',
        twilio_account_sid: 'ACCOUNT_SID',
        twilio_auth_token: 'ENCRYPTED_TOKEN'
      },
      email: {
        from_address: 'noreply@relaxedretreat.co.nz',
        from_name: 'Relaxed Retreat Spa',
        sendgrid_api_key: 'ENCRYPTED_KEY_HERE'
      }
    },

    voice_settings: {
      language: 'en-NZ',
      voice_provider: 'elevenlabs',
      voice_id: 'female_natural_nz',
      speaking_rate: 1.0,
      emotion: 'professional_warm'
    }
  },

  clinic_002: {
    tenant_id: 'clinic_002',
    business_name: 'Skin Clinic Auckland',
    country: 'NZ',
    phone_number: '+64 9 987 6543',

    greeting_message: 'Hi, you\'ve reached Skin Clinic Auckland. I can book your appointment or help answer questions.',

    services: [
      {
        id: 'consult_30',
        name: 'Consultation',
        duration_minutes: 30,
        cliniko_service_id: 'svc_skin_001'
      },
      {
        id: 'laser_45',
        name: 'Laser Treatment',
        duration_minutes: 45,
        cliniko_service_id: 'svc_skin_002'
      }
    ],

    business_hours: {
      monday: { open: '10:00', close: '17:00' },
      tuesday: { open: '10:00', close: '17:00' },
      wednesday: { open: '10:00', close: '19:00' },
      thursday: { open: '10:00', close: '17:00' },
      friday: { open: '10:00', close: '17:00' },
      saturday: null,
      sunday: null
    },

    escalation_rules: {
      transfer_on_request: true,
      transfer_on_high_confidence_failure: true,
      transfer_on_frustration: true,
      human_queue_id: 'queue_xyz_002'
    },

    booking_rules: {
      allow_cancellation: true,
      allow_rescheduling: true,
      min_advance_booking_hours: 4,
      max_advance_booking_days: 30,
      cancellation_policy_url: 'https://skinclinic.co.nz/terms'
    },

    integrations: {
      cliniko: {
        api_key: 'ENCRYPTED_KEY_HERE',
        business_id: 'cliniko_clinic_002'
      },
      sms: {
        from_number: '+64 2 0987 654',
        twilio_account_sid: 'ACCOUNT_SID',
        twilio_auth_token: 'ENCRYPTED_TOKEN'
      },
      email: {
        from_address: 'noreply@skinclinic.co.nz',
        from_name: 'Skin Clinic Auckland',
        sendgrid_api_key: 'ENCRYPTED_KEY_HERE'
      }
    },

    voice_settings: {
      language: 'en-NZ',
      voice_provider: 'elevenlabs',
      voice_id: 'female_professional_nz',
      speaking_rate: 0.95,
      emotion: 'professional'
    }
  },

  sanctuary_001: {
    tenant_id: 'sanctuary_001',
    business_name: 'Sanctuary Day Spa',
    country: 'NZ',
    phone_number: '+64 3 443 XXXX',

    greeting_message: 'Welcome to Sanctuary Day Spa. How can I help you today?',

    // All staff with specialties
    staff: [
      {
        id: 'staff_rhaysa',
        name: 'Rhaysa',
        title: 'Beauty Therapist',
        specialties: ['facials', 'waxing', 'brow', 'lashes', 'pedicure', 'manicure'],
        bio: 'Specialized in beauty treatments and nail services'
      },
      {
        id: 'staff_debora',
        name: 'Debora',
        title: 'Beauty and Massage Therapist',
        specialties: ['massage', 'facials', 'body_treatments', 'waxing'],
        bio: 'Expert in both relaxation massage and facial treatments'
      },
      {
        id: 'staff_minky',
        name: 'Minky',
        title: 'Senior Beauty Therapist and Nail Technician',
        specialties: ['nails', 'facials', 'beauty_treatments', 'brow', 'lashes'],
        bio: 'Senior nail specialist with expertise in all nail services'
      },
      {
        id: 'staff_thamy',
        name: 'Thamy',
        title: 'Senior Massage and Beauty Therapist',
        specialties: ['massage', 'facials', 'body_treatments', 'body_wraps'],
        bio: 'Senior therapist with deep expertise in massage and beauty'
      },
      {
        id: 'staff_vanessa',
        name: 'Vanessa',
        title: 'Advanced Skin and Beauty Therapist',
        specialties: ['advanced_facials', 'laser_treatments', 'injectables', 'dermapen', 'skin_treatments'],
        bio: 'Advanced practitioner specializing in clinical skin treatments'
      }
    ],

    // Comprehensive service database organized by category
    services: [
      // MASSAGE SERVICES
      {
        id: 'massage_relax_30',
        name: 'Relaxation Massage 30 min',
        category: 'Massage',
        duration_minutes: 30,
        price: 85,
        description: 'Gentle, soothing massage perfect for stress relief',
        upsell: 'Upgrade to 60 minutes for just $60 more to experience full-body relaxation'
      },
      {
        id: 'massage_relax_45',
        name: 'Relaxation Massage 45 min',
        category: 'Massage',
        duration_minutes: 45,
        price: 115,
        description: 'Extended relaxation covering more of your body',
        upsell: 'Add 15 minutes to reach the full 60-minute experience for just $30 more'
      },
      {
        id: 'massage_relax_60',
        name: 'Relaxation Massage 60 min',
        category: 'Massage',
        duration_minutes: 60,
        price: 145,
        description: 'Full-body relaxation massage for deep stress relief',
        upsell: 'Extend to 90 minutes for an extra $50 - includes deeper muscle work'
      },
      {
        id: 'massage_relax_90',
        name: 'Relaxation Massage 90 min',
        category: 'Massage',
        duration_minutes: 90,
        price: 195,
        description: 'Premium deep relaxation with full body coverage and extended time'
      },
      {
        id: 'massage_firm_30',
        name: 'Firm Pressure Massage 30 min',
        category: 'Massage',
        duration_minutes: 30,
        price: 85,
        description: 'Stronger pressure for targeted muscle relief',
        upsell: 'Upgrade to 60 minutes for better results on muscle tension'
      },
      {
        id: 'massage_firm_45',
        name: 'Firm Pressure Massage 45 min',
        category: 'Massage',
        duration_minutes: 45,
        price: 125,
        description: 'Extended firm pressure treatment'
      },
      {
        id: 'massage_firm_60',
        name: 'Firm Pressure Massage 60 min',
        category: 'Massage',
        duration_minutes: 60,
        price: 145,
        description: 'Full-body deep tissue treatment'
      },
      {
        id: 'massage_firm_90',
        name: 'Firm Pressure Massage 90 min',
        category: 'Massage',
        duration_minutes: 90,
        price: 195,
        description: 'Premium deep tissue with extended muscle work'
      },
      {
        id: 'massage_hotstone_60',
        name: 'Hot Stone Massage 60 min',
        category: 'Massage',
        duration_minutes: 60,
        price: 155,
        description: 'Therapeutic heat with smooth stones for deep muscle relief',
        upsell: 'Add 30 minutes for enhanced heat therapy benefits - only $50 more'
      },
      {
        id: 'massage_hotstone_90',
        name: 'Hot Stone Massage 90 min',
        category: 'Massage',
        duration_minutes: 90,
        price: 205,
        description: 'Extended hot stone therapy with full body treatment'
      },
      {
        id: 'massage_pregnancy_60',
        name: 'Pregnancy Massage 60 min',
        category: 'Massage',
        duration_minutes: 60,
        price: 155,
        description: 'Specialized safe massage for pregnancy comfort',
        recommended_staff: ['debora', 'thamy']
      },
      {
        id: 'massage_pregnancy_90',
        name: 'Pregnancy Massage 90 min',
        category: 'Massage',
        duration_minutes: 90,
        price: 205,
        description: 'Extended pregnancy massage with comprehensive relief'
      },
      {
        id: 'massage_lymphatic_60',
        name: 'Lymphatic Massage 60 min',
        category: 'Massage',
        duration_minutes: 60,
        price: 145,
        description: 'Specialized drainage massage to boost immunity and reduce swelling'
      },
      {
        id: 'massage_lymphatic_90',
        name: 'Lymphatic Massage 90 min',
        category: 'Massage',
        duration_minutes: 90,
        price: 195,
        description: 'Extended lymphatic drainage for maximum detoxification'
      },
      {
        id: 'massage_couple_60',
        name: 'Couple Massage 60 min',
        category: 'Massage',
        duration_minutes: 60,
        price: 290,
        description: 'Two therapists, two massages side-by-side',
        upsell: 'Upgrade to 90 minutes with both therapists for $390 - incredible value'
      },
      {
        id: 'massage_couple_90',
        name: 'Couple Massage 90 min',
        category: 'Massage',
        duration_minutes: 90,
        price: 390,
        description: 'Premium couples experience with extended massage'
      },

      // BODY TREATMENTS & PACKAGES
      {
        id: 'body_glow',
        name: 'Body Glow',
        category: 'Body Treatments',
        duration_minutes: 50,
        price: 145,
        description: 'Exfoliating body treatment for radiant skin',
        upsell: 'Add 30-min massage for just $70 more - Body Glow + Massage combo'
      },
      {
        id: 'body_bliss',
        name: 'Body Bliss Package',
        category: 'Body Treatments',
        duration_minutes: 120,
        price: 280,
        description: '2-hour full body indulgence package'
      },
      {
        id: 'body_wrap',
        name: 'Body Wrap',
        category: 'Body Treatments',
        duration_minutes: 75,
        price: 195,
        description: 'Nourishing wrap treatment'
      },
      {
        id: 'body_wrap_plus_massage',
        name: 'Body Wrap + 30 min Massage',
        category: 'Body Treatments',
        duration_minutes: 105,
        price: 250,
        description: 'Body wrap with massage extension'
      },
      {
        id: 'tranquility_package',
        name: 'Tranquility Package',
        category: 'Body Treatments',
        duration_minutes: 270,
        price: 515,
        description: '4.5 hours of pure relaxation - our ultimate pampering experience',
        recommended_staff: ['thamy', 'debora']
      },
      {
        id: 'sumptuous_package',
        name: 'Sumptuous Package',
        category: 'Body Treatments',
        duration_minutes: 150,
        price: 325,
        description: '2.5 hours of luxurious treatments'
      },
      {
        id: 'soak_melt_massage',
        name: 'Soak, Melt & Massage',
        category: 'Body Treatments',
        duration_minutes: 105,
        price: 195,
        description: '1 hour 45 min of hydrotherapy and massage combined'
      },

      // RELAXATION FACIALS
      {
        id: 'facial_teen_reset',
        name: 'Teen Skin Reset - Dermalogica (12-18y)',
        category: 'Relaxation Facial',
        duration_minutes: 30,
        price: 105,
        description: 'Specialized teen skincare facial',
        recommended_staff: ['rhaysa', 'minky']
      },
      {
        id: 'facial_algotherm_restore',
        name: 'Algotherm Ocean Restore',
        category: 'Relaxation Facial',
        duration_minutes: 60,
        price: 185,
        description: 'Ocean-based hydrating facial treatment'
      },
      {
        id: 'facial_algotherm_rejuv',
        name: 'Algotherm Rejuvenate & Radiate',
        category: 'Relaxation Facial',
        duration_minutes: 80,
        price: 245,
        description: 'Advanced rejuvenation and brightening facial'
      },
      {
        id: 'facial_dermaplaning_express',
        name: 'Dermaplaning Express',
        category: 'Relaxation Facial',
        duration_minutes: 30,
        price: 110,
        description: 'Quick skin exfoliation for glow'
      },
      {
        id: 'facial_dermaplaning_glow',
        name: 'Dermaplaning Facial Glow Renewal',
        category: 'Relaxation Facial',
        duration_minutes: 45,
        price: 155,
        description: 'Exfoliation with glow-enhancing treatment'
      },
      {
        id: 'facial_dermaplaning_led',
        name: 'Dermaplaning Facial + LED Light',
        category: 'Relaxation Facial',
        duration_minutes: 60,
        price: 185,
        description: 'Dermaplaning with LED light therapy for maximum results',
        upsell: 'Add 30 minutes for deeper skin treatment benefits'
      },

      // ADVANCED FACIALS
      {
        id: 'advanced_skin_consult',
        name: 'Skin Consultation',
        category: 'Advanced Facial',
        duration_minutes: 20,
        price: 45,
        description: 'Professional skin analysis to determine best treatments',
        recommended_staff: ['vanessa']
      },
      {
        id: 'advanced_ocos_boost_30',
        name: 'O-Cosmedics 30 min Facial Boost',
        category: 'Advanced Facial',
        duration_minutes: 30,
        price: 120,
        description: 'Quick professional-grade facial',
        upsell: 'Upgrade to 60 minutes for deeper treatment - just $55 more'
      },
      {
        id: 'advanced_ocos_rescue',
        name: 'O-Cosmedics 45 min The Rescue',
        category: 'Advanced Facial',
        duration_minutes: 45,
        price: 145,
        description: 'Intensive rescue treatment for stressed skin'
      },
      {
        id: 'advanced_ocos_antiaging',
        name: 'O-Cosmedics 45 min Anti-Aging Restore',
        category: 'Advanced Facial',
        duration_minutes: 45,
        price: 145,
        description: 'Specialized anti-aging facial treatment'
      },
      {
        id: 'advanced_ocos_brighten',
        name: 'O-Cosmedics 60 min Brighten & Firm',
        category: 'Advanced Facial',
        duration_minutes: 60,
        price: 175,
        description: 'Comprehensive brightening and firming treatment'
      },
      {
        id: 'advanced_ocos_peel',
        name: 'O-Cosmedics 75 min Including Peel',
        category: 'Advanced Facial',
        duration_minutes: 75,
        price: 195,
        description: 'Professional peel with extended facial treatment'
      },
      {
        id: 'advanced_obiome_collagen',
        name: 'O-Biome Oxygenating - Collagen Booster',
        category: 'Advanced Facial',
        duration_minutes: 75,
        price: 229,
        description: 'Oxygen therapy to boost collagen production',
        upsell: 'Premium oxygenating therapy - investment in visible skin improvements'
      },
      {
        id: 'advanced_obiome_clear',
        name: 'O-Biome Oxygenating - Clear Skin',
        category: 'Advanced Facial',
        duration_minutes: 75,
        price: 229,
        description: 'Oxygen therapy targeting acne and breakouts'
      },
      {
        id: 'advanced_obiome_bright',
        name: 'O-Biome Oxygenating - Bright Skin',
        category: 'Advanced Facial',
        duration_minutes: 75,
        price: 229,
        description: 'Oxygen therapy for radiance and glow'
      },
      {
        id: 'advanced_obiome_lift',
        name: 'O-Biome Oxygenating - Lift & Firm',
        category: 'Advanced Facial',
        duration_minutes: 75,
        price: 229,
        description: 'Oxygen therapy with lifting and firming effects'
      },
      {
        id: 'advanced_aha_peel',
        name: 'AHA Peel',
        category: 'Advanced Facial',
        duration_minutes: 40,
        price: 145,
        description: 'Chemical peel for exfoliation and renewal',
        recommended_staff: ['vanessa']
      },
      {
        id: 'advanced_carbon_peel',
        name: 'Carbon Peel Facial',
        category: 'Advanced Facial',
        duration_minutes: 45,
        price: 260,
        description: 'Advanced laser carbon peel for deep skin renewal',
        upsell: 'Premium treatment with visible results - rejuvenates skin significantly'
      },
      {
        id: 'advanced_led_light',
        name: 'LED Light Treatment',
        category: 'Advanced Facial',
        duration_minutes: 20,
        price: 50,
        description: 'Light therapy to boost skin healing'
      },
      {
        id: 'advanced_picosecond_laser',
        name: 'Fractional Picosecond Laser Treatment',
        category: 'Advanced Facial',
        duration_minutes: 45,
        price: 200,
        description: 'Advanced laser for scars and texture',
        recommended_staff: ['vanessa']
      },
      {
        id: 'advanced_hifu_neck',
        name: 'HIFU Neck',
        category: 'Advanced Facial',
        duration_minutes: 40,
        price: 250,
        description: 'Ultrasound lifting for neck and jawline',
        upsell: 'Combine with Full Face for complete facial lifting - $530'
      },
      {
        id: 'advanced_hifu_half_face',
        name: 'HIFU Half Face',
        category: 'Advanced Facial',
        duration_minutes: 45,
        price: 350,
        description: 'Ultrasound lifting for half face - visible tightening'
      },
      {
        id: 'advanced_hifu_full_face',
        name: 'HIFU Full Face',
        category: 'Advanced Facial',
        duration_minutes: 105,
        price: 530,
        description: 'Complete facial ultrasound lifting treatment - natural facelift results',
        recommended_staff: ['vanessa'],
        upsell: 'Add neck for only $160 more - complete face and neck lifting'
      },
      {
        id: 'advanced_hifu_full_face_neck',
        name: 'HIFU Full Face + Neck',
        category: 'Advanced Facial',
        duration_minutes: 80,
        price: 690,
        description: 'Premium complete facial and neck ultrasound lifting',
        recommended_staff: ['vanessa']
      },

      // DERMAPEN NEEDLING
      {
        id: 'dermapen_consult',
        name: 'Dermapen Consultation',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 25,
        price: 45,
        description: 'Professional consultation for needling treatments',
        recommended_staff: ['vanessa']
      },
      {
        id: 'dermapen_scalp',
        name: 'Dermapen Scalp Treatment',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 30,
        price: 350,
        description: 'Specialized scalp needling - targets hair loss and scalp health',
        recommended_staff: ['vanessa']
      },
      {
        id: 'dermapen_scar',
        name: 'Dermapen C-Section Scar',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 30,
        price: 260,
        description: 'Specialized scar revision treatment',
        recommended_staff: ['vanessa']
      },
      {
        id: 'dermapen_face_returning',
        name: 'Dermapen Face - Returning Client',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 40,
        price: 270,
        description: 'Microneedling for facial rejuvenation',
        recommended_staff: ['vanessa']
      },
      {
        id: 'dermapen_face_new',
        name: 'Dermapen Face - New Client (Including Consultation)',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 70,
        price: 280,
        description: 'Complete first-time microneedling experience with consultation',
        recommended_staff: ['vanessa']
      },
      {
        id: 'dermapen_face_neck_returning',
        name: 'Dermapen Face & Neck - Returning',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 45,
        price: 299,
        description: 'Extended microneedling for face and neck',
        recommended_staff: ['vanessa']
      },
      {
        id: 'dermapen_face_neck_new',
        name: 'Dermapen Face & Neck - New Client',
        category: 'Dermapen 4 (Needling)',
        duration_minutes: 70,
        price: 310,
        description: 'Comprehensive microneedling for face and neck',
        recommended_staff: ['vanessa']
      },

      // LASER TREATMENTS - SKIN PIGMENTATION/REJUVENATION
      {
        id: 'laser_decolletage',
        name: 'Laser Pigmentation/Rejuvenation - Decolletage',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 30,
        price: 280,
        description: 'Laser treatment for chest and decolletage area',
        recommended_staff: ['vanessa']
      },
      {
        id: 'laser_eye_area',
        name: 'Laser - Eye Area',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 10,
        price: 100,
        description: 'Targeted laser for delicate eye area'
      },
      {
        id: 'laser_eyes_surrounding',
        name: 'Laser - Eyes Surrounding',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 20,
        price: 125,
        description: 'Laser treatment around eye area'
      },
      {
        id: 'laser_half_face',
        name: 'Laser - Half Face',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 30,
        price: 295,
        description: 'Laser treatment for half face - pigmentation or rejuvenation'
      },
      {
        id: 'laser_hands',
        name: 'Laser - Hands',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 30,
        price: 120,
        description: 'Age spot and pigmentation treatment for hands'
      },
      {
        id: 'laser_neck',
        name: 'Laser - Front or Back of Neck',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 30,
        price: 145,
        description: 'Targeted neck treatment'
      },
      {
        id: 'laser_forehead',
        name: 'Laser - Forehead',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 30,
        price: 115,
        description: 'Forehead pigmentation and rejuvenation'
      },
      {
        id: 'laser_side_face',
        name: 'Laser - Side of Face',
        category: 'Laser Skin Pigmentation/Rejuvenation',
        duration_minutes: 30,
        price: 195,
        description: 'Cheek or temple area laser treatment'
      },

      // SHR LASER HAIR REMOVAL
      {
        id: 'shr_beard',
        name: 'SHR Beard',
        category: 'Laser Hair Removal',
        duration_minutes: 30,
        price: 170,
        description: 'Fast, effective facial hair removal'
      },
      {
        id: 'shr_bikini',
        name: 'SHR Bikini',
        category: 'Laser Hair Removal',
        duration_minutes: 30,
        price: 150,
        description: 'Bikini line hair removal'
      },
      {
        id: 'shr_brazilian_full',
        name: 'SHR Brazilian - Full',
        category: 'Laser Hair Removal',
        duration_minutes: 30,
        price: 200,
        description: 'Complete Brazilian hair removal'
      },
      {
        id: 'shr_underarms',
        name: 'SHR Underarms',
        category: 'Laser Hair Removal',
        duration_minutes: 25,
        price: 140,
        description: 'Underarm hair removal - smooth for weeks'
      },
      {
        id: 'shr_full_leg',
        name: 'SHR Full Leg',
        category: 'Laser Hair Removal',
        duration_minutes: 40,
        price: 400,
        description: 'Complete leg hair removal - our most popular service',
        upsell: 'Add bikini for $50 more for complete leg and bikini coverage'
      },
      {
        id: 'shr_half_leg',
        name: 'SHR Half Leg',
        category: 'Laser Hair Removal',
        duration_minutes: 30,
        price: 265,
        description: 'Lower leg hair removal'
      },
      {
        id: 'shr_upper_leg',
        name: 'SHR Upper Leg',
        category: 'Laser Hair Removal',
        duration_minutes: 30,
        price: 280,
        description: 'Upper leg and thigh hair removal'
      },
      {
        id: 'shr_chest',
        name: 'SHR Chest',
        category: 'Laser Hair Removal',
        duration_minutes: 30,
        price: 175,
        description: 'Chest hair removal'
      },
      {
        id: 'shr_full_back',
        name: 'SHR Full Back',
        category: 'Laser Hair Removal',
        duration_minutes: 40,
        price: 330,
        description: 'Complete back hair removal',
        upsell: 'Add shoulders for smoother all-over coverage'
      },
      {
        id: 'shr_neck',
        name: 'SHR Neck',
        category: 'Laser Hair Removal',
        duration_minutes: 20,
        price: 75,
        description: 'Neck and throat hair removal'
      },

      // BROW & LASHES
      {
        id: 'brow_design',
        name: 'Brow Design',
        category: 'Brow and Lashes',
        duration_minutes: 15,
        price: 35,
        description: 'Professional brow shaping'
      },
      {
        id: 'brow_tint',
        name: 'Brow Tint',
        category: 'Brow and Lashes',
        duration_minutes: 20,
        price: 31,
        description: 'Brow color tinting'
      },
      {
        id: 'brow_design_tint',
        name: 'Brow Design & Tint',
        category: 'Brow and Lashes',
        duration_minutes: 30,
        price: 60,
        description: 'Shape and tint in one appointment',
        upsell: 'Add Lash Lift for only $50 more for complete eye enhancement'
      },
      {
        id: 'lash_tint',
        name: 'Lash Tint',
        category: 'Brow and Lashes',
        duration_minutes: 20,
        price: 33,
        description: 'Eyelash color tinting'
      },
      {
        id: 'lash_lift',
        name: 'Lash Lift',
        category: 'Brow and Lashes',
        duration_minutes: 30,
        price: 110,
        description: 'Semi-permanent lash curl'
      },
      {
        id: 'lash_lift_tint',
        name: 'Lash Lift & Tint',
        category: 'Brow and Lashes',
        duration_minutes: 40,
        price: 130,
        description: 'Lift and color your lashes - complete eye enhancement',
        upsell: 'Perfect with Brow Design for total eye transformation'
      },
      {
        id: 'lash_extensions_volume',
        name: 'Lash Extensions - Volume',
        category: 'Brow and Lashes',
        duration_minutes: 75,
        price: 145,
        description: 'Full volume lash extensions'
      },
      {
        id: 'lash_extensions_brazilian',
        name: 'Lash Extensions - Brazilian Extra Volume',
        category: 'Brow and Lashes',
        duration_minutes: 30,
        price: 165,
        description: 'Ultra-volume Brazilian lash extensions'
      },
      {
        id: 'lash_infill_2weeks',
        name: 'Lash Extensions - Infill (2 weeks)',
        category: 'Brow and Lashes',
        duration_minutes: 40,
        price: 100,
        description: 'Maintenance infill for lash extensions'
      },

      // MANICURE
      {
        id: 'manicure_prep_polish',
        name: 'Prep & Polish OPI Manicure',
        category: 'Manicure Nails',
        duration_minutes: 30,
        price: 55,
        description: 'Classic manicure with OPI polish'
      },
      {
        id: 'manicure_gel',
        name: 'Gel Manicure',
        category: 'Manicure Nails',
        duration_minutes: 60,
        price: 95,
        description: 'Durable gel polish manicure - lasts 2+ weeks',
        upsell: 'Upgrade to extensions for added length and drama'
      },
      {
        id: 'manicure_gel_extensions',
        name: 'Gel Manicure with Extensions',
        category: 'Manicure Nails',
        duration_minutes: 90,
        price: 155,
        description: 'Gel with nail extensions for length and glamour'
      },
      {
        id: 'manicure_biab',
        name: 'BIAB Gel Natural Nails Manicure',
        category: 'Manicure Nails',
        duration_minutes: 60,
        price: 95,
        description: 'Builder in a Bottle - strengthens natural nails'
      },
      {
        id: 'manicure_heavenly_deluxe',
        name: 'Heavenly Hands Deluxe Manicure',
        category: 'Manicure Nails',
        duration_minutes: 60,
        price: 95,
        description: 'Premium manicure with extended pampering'
      },
      {
        id: 'manicure_deluxe_combo',
        name: 'Deluxe Nails - Mani and Pedi Combo',
        category: 'Manicure Nails',
        duration_minutes: 120,
        price: 175,
        description: 'Complete mani-pedi combo - value package',
        upsell: 'Popular choice - save money and get complete nail care'
      },

      // PEDICURE
      {
        id: 'pedicure_prep_polish',
        name: 'Prep & Polish OPI Pedicure',
        category: 'Pedicure Nails',
        duration_minutes: 30,
        price: 65,
        description: 'Classic pedicure with OPI polish'
      },
      {
        id: 'pedicure_spa',
        name: 'Revitalising Spa Pedicure 60 mins',
        category: 'Pedicure Nails',
        duration_minutes: 60,
        price: 120,
        description: 'Spa-style pedicure with extended treatment',
        upsell: 'Our most popular pedicure - includes hydration and massage'
      },
      {
        id: 'pedicure_gel',
        name: 'Shellac Pedicure',
        category: 'Pedicure Nails',
        duration_minutes: 60,
        price: 120,
        description: 'Gel pedicure - lasts weeks'
      },
      {
        id: 'pedicure_mens',
        name: 'Men\'s Pedicure',
        category: 'Pedicure Nails',
        duration_minutes: 60,
        price: 110,
        description: 'Professional pedicure designed for men'
      }
    ],

    business_hours: {
      monday: { open: '09:00', close: '18:00' },
      tuesday: { open: '09:00', close: '18:00' },
      wednesday: { open: '09:00', close: '20:00' },
      thursday: { open: '09:00', close: '18:00' },
      friday: { open: '09:00', close: '21:00' },
      saturday: { open: '10:00', close: '17:00' },
      sunday: null
    },

    escalation_rules: {
      transfer_on_request: true,
      transfer_on_high_confidence_failure: true,
      transfer_on_frustration: true,
      human_queue_id: 'queue_sanctuary_001'
    },

    booking_rules: {
      allow_cancellation: true,
      allow_rescheduling: true,
      min_advance_booking_hours: 2,
      max_advance_booking_days: 60,
      cancellation_policy_url: 'https://sanctuarydayspa.co.nz/cancellation'
    },

    integrations: {
      timely: {
        api_key: 'ENCRYPTED_KEY_HERE',
        business_id: 'timely_sanctuary_001',
        booking_url: 'https://bookings.gettimely.com/sanctuarydayspaandmedilounge/book'
      },
      sms: {
        from_number: '+64 3 XXX XXXX',
        twilio_account_sid: 'ACCOUNT_SID',
        twilio_auth_token: 'ENCRYPTED_TOKEN'
      },
      email: {
        // Booking requests go to the team, not to individual staff
        booking_requests_to: 'info@sanctuarywanaka.co.nz',
        from_address: 'bookings@sanctuarydayspa.co.nz',
        from_name: 'Sanctuary Day Spa - Ava Receptionist',
        sendgrid_api_key: 'ENCRYPTED_KEY_HERE'
      }
    },

    voice_settings: {
      language: 'en-NZ',
      voice_provider: 'elevenlabs',
      voice_id: 'rachel',
      speaking_rate: 0.85,
      emotion: 'calm_professional',
      name: 'Ava'
    },

    // Upselling rules - Ava will suggest upgrades based on customer choices
    upsell_rules: {
      enabled: true,
      suggest_longer_duration: true, // Suggest 60min when customer picks 30min
      suggest_complementary_services: true, // Suggest add-ons
      highlight_premium_treatments: ['tranquility_package', 'advanced_hifu_full_face_neck', 'sumptuous_package']
    }
  }
};

/**
 * Load business configuration
 * In production, this queries PostgreSQL
 *
 * @param {string} tenantId - Business tenant ID
 * @returns {Object} - Business configuration
 */
function loadBusinessConfig(tenantId) {
  const config = BUSINESS_CONFIGS[tenantId];

  if (!config) {
    throw new Error(`Business config not found for tenant: ${tenantId}`);
  }

  // In production, validate and decrypt sensitive keys
  // validateConfig(config);
  // decryptSensitiveKeys(config);

  return config;
}

/**
 * Get tenant ID from phone number
 * Routes inbound calls to correct business
 *
 * In production:
 * - Query DB: SELECT tenant_id FROM phone_numbers WHERE phone = ?
 * - Cache result
 *
 * @param {string} phoneNumber - E.164 format phone
 * @returns {string} - Tenant ID
 */
function getTenantIdFromPhone(phoneNumber) {
  // Mapping of inbound phone numbers to tenants
  const PHONE_TO_TENANT = {
    '+6491234567': 'spa_001',
    '+6499876543': 'clinic_002',
    '+64': 'sanctuary_001' // Default to Sanctuary (update once Twilio number is assigned)
  };

  // Check exact match first
  if (PHONE_TO_TENANT[phoneNumber]) {
    return PHONE_TO_TENANT[phoneNumber];
  }

  // Check if it starts with +64 3 (Sanctuary area code)
  if (phoneNumber.startsWith('+643')) {
    return 'sanctuary_001';
  }

  throw new Error(`No tenant configured for phone: ${phoneNumber}`);
}

/**
 * List all configured tenants (for admin)
 */
function listAllTenants() {
  return Object.keys(BUSINESS_CONFIGS).map(id => ({
    tenantId: id,
    businessName: BUSINESS_CONFIGS[id].business_name
  }));
}

/**
 * Validate configuration structure
 */
function validateConfig(config) {
  const requiredFields = [
    'tenant_id',
    'business_name',
    'greeting_message',
    'services',
    'business_hours',
    'integrations'
  ];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }

  // Validate services
  if (!Array.isArray(config.services) || config.services.length === 0) {
    throw new Error('At least one service must be configured');
  }

  for (const service of config.services) {
    if (!service.id || !service.name || !service.duration_minutes) {
      throw new Error('Invalid service configuration');
    }
  }

  return true;
}

module.exports = {
  loadBusinessConfig,
  getTenantIdFromPhone,
  listAllTenants,
  validateConfig
};
